"use client";
import { useEffect, useState, useCallback } from "react";

export type ConnectionState = "open" | "close" | "connecting" | "qr";

interface InstanceState {
  state: ConnectionState | null;
  qrCode: string | null;
  /** Código de pareamento (8 caracteres, estilo "1HL7-FJSL"). Só vem quando
   *  `number` é passado e a instância não está `open`. */
  pairingCode: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Polling do status + QR/pairing code de uma instância.
 * - Se `number` for informado, a rota /connect já devolve o pairingCode.
 * - Quando vira "open", para de puxar QR (economiza round-trip).
 */
export function useInstanceStatus(
  instanceName: string | null,
  pollInterval = 3000,
  number?: string | null
) {
  const [state, setState] = useState<InstanceState>({
    state: null,
    qrCode: null,
    pairingCode: null,
    loading: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!instanceName) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const statusRes = await fetch(
        `/api/instances/${instanceName}/status`
      );
      const statusData = await statusRes.json();
      const connState: ConnectionState =
        statusData?.instance?.state || "close";

      let qrCode: string | null = null;
      let pairingCode: string | null = null;
      if (connState !== "open") {
        const qs = number ? `?number=${encodeURIComponent(number)}` : "";
        const connectRes = await fetch(
          `/api/instances/${instanceName}/connect${qs}`
        );
        const connectData = await connectRes.json();
        qrCode =
          connectData?.qrcode?.base64 || connectData?.base64 || null;
        pairingCode =
          connectData?.pairingCode || connectData?.qrcode?.pairingCode || null;
      }

      setState({
        state: connState,
        qrCode,
        pairingCode,
        loading: false,
        error: null,
      });
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        loading: false,
        error: (err as Error).message,
      }));
    }
  }, [instanceName, number]);

  useEffect(() => {
    if (!instanceName) return;
    refresh();
    const timer = setInterval(refresh, pollInterval);
    return () => clearInterval(timer);
  }, [instanceName, pollInterval, refresh]);

  return { ...state, refresh };
}

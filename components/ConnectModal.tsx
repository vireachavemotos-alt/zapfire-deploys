"use client";
import { useEffect, useState } from "react";
import { useInstanceStatus } from "@/hooks/useInstanceStatus";
import { GlassCard } from "./GlassCard";
import { NeonButton } from "./NeonButton";
import { CheckCircle2, X, Smartphone, QrCode, KeyRound, Copy } from "lucide-react";

interface ConnectModalProps {
  instanceName: string;
  /** Número amarrado à instância (só dígitos). Quando presente, habilita
   *  o modo "código de pareamento". Quando ausente, só QR. */
  number?: string | null;
  onClose: () => void;
  onConnected: () => void;
}

type Mode = "qr" | "pairing";

/**
 * Formata um pairing code bruto (ex "1HL7FJSL") como "1HL7-FJSL",
 * que é o layout que o WhatsApp mostra na tela de pareamento.
 */
function formatPairing(code: string): string {
  const clean = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (clean.length !== 8) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

export default function ConnectModal({
  instanceName,
  number,
  onClose,
  onConnected,
}: ConnectModalProps) {
  // Default: pairing se tem número, QR senão.
  const [mode, setMode] = useState<Mode>(number ? "pairing" : "qr");
  const [copied, setCopied] = useState(false);

  const { state, qrCode, pairingCode, loading, error } = useInstanceStatus(
    instanceName,
    3000,
    mode === "pairing" ? number : null
  );

  useEffect(() => {
    if (state === "open") {
      const t = setTimeout(onConnected, 1200);
      return () => clearTimeout(t);
    }
  }, [state, onConnected]);

  const qrSrc = qrCode
    ? qrCode.startsWith("data:")
      ? qrCode
      : `data:image/png;base64,${qrCode}`
    : null;

  const canPair = Boolean(number);
  const pairingFmt = pairingCode ? formatPairing(pairingCode) : null;

  async function copyPairing() {
    if (!pairingCode) return;
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
    >
      <GlassCard
        strong
        className="w-full max-w-sm relative p-6 text-center max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center justify-center gap-2 mb-1">
          <Smartphone className="h-4 w-4 text-[#FF0033]" />
          <h2 className="text-base font-semibold text-white">
            Conectar WhatsApp
          </h2>
        </div>
        <p className="text-xs text-zinc-500 mb-4">
          Instância: <span className="text-[#FF0033]">{instanceName}</span>
        </p>

        {/* Toggle QR vs Pairing */}
        {canPair && state !== "open" && (
          <div className="inline-flex items-center rounded-md border border-white/10 bg-black/40 p-0.5 mb-4 text-xs">
            <button
              onClick={() => setMode("qr")}
              className={`px-3 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors ${
                mode === "qr"
                  ? "bg-[#FF0033] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <QrCode className="h-3.5 w-3.5" /> QR Code
            </button>
            <button
              onClick={() => setMode("pairing")}
              className={`px-3 py-1.5 rounded-sm flex items-center gap-1.5 transition-colors ${
                mode === "pairing"
                  ? "bg-[#FF0033] text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" /> Código
            </button>
          </div>
        )}

        {loading && !qrSrc && !pairingFmt && state !== "open" && (
          <div className="flex items-center justify-center h-48">
            <div className="h-8 w-8 rounded-full border-2 border-white/10 border-t-[#FF0033] animate-spin" />
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 text-left text-xs text-red-300 mb-4">
            {error}
          </div>
        )}

        {/* Modo QR */}
        {mode === "qr" && qrSrc && state !== "open" && (
          <>
            <div className="inline-block rounded-md p-3 bg-white mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="QR Code WhatsApp"
                width={200}
                height={200}
                className="block"
              />
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed px-2">
              WhatsApp → Menu → Dispositivos conectados → Conectar dispositivo
            </p>
            <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Aguardando leitura
            </div>
          </>
        )}

        {/* Modo Pairing Code */}
        {mode === "pairing" && state !== "open" && (
          <>
            {pairingFmt ? (
              <>
                <button
                  onClick={copyPairing}
                  className="group inline-flex items-center gap-3 rounded-lg border-2 border-[#FF0033]/40 bg-[#FF0033]/5 hover:bg-[#FF0033]/10 px-5 py-4 mb-4 transition-colors"
                >
                  <span className="font-mono text-3xl font-bold tracking-[0.2em] text-white tabular-nums">
                    {pairingFmt}
                  </span>
                  <span className="text-zinc-500 group-hover:text-[#FF0033] transition-colors">
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </span>
                </button>
                <div className="text-xs text-zinc-400 leading-relaxed px-2 space-y-1">
                  <p className="font-medium text-zinc-300">
                    No celular vinculado a <span className="text-white">+{number}</span>:
                  </p>
                  <p>1. Abra o WhatsApp → Menu (⋮) → Dispositivos conectados</p>
                  <p>2. Toque em <b>Conectar um dispositivo</b></p>
                  <p>3. Toque em <b>Conectar com número de telefone</b></p>
                  <p>4. Digite o código acima</p>
                </div>
                <div className="mt-3 flex items-center justify-center gap-2 text-[11px] text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Aguardando confirmação no celular
                </div>
              </>
            ) : (
              !loading && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                  Não foi possível gerar o código. Tente o QR Code ou recrie a instância informando o número.
                </div>
              )
            )}
          </>
        )}

        {state === "open" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <p className="text-base font-semibold text-emerald-300">
              Conectado com sucesso
            </p>
            <p className="text-xs text-zinc-500">Fechando automaticamente...</p>
          </div>
        )}

        <NeonButton
          variant="ghost"
          size="sm"
          className="w-full mt-5"
          onClick={onClose}
        >
          Fechar
        </NeonButton>
      </GlassCard>
    </div>
  );
}

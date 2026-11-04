"use client";
// Card do topo da página /grupos — fluxo 2 passos:
//  1) usuário cola o link `https://chat.whatsapp.com/XYZ`, clica Preview
//     → GET /api/grupos/preview retorna nome/foto/N membros
//  2) confirma visualmente e clica "Entrar" → POST /api/grupos/entrar
// Preview SEMPRE antes de entrar porque entrar expõe o número à blacklist
// do WhatsApp — se o grupo for lixo, o preview permite recusar sem custo.
import { useState } from "react";
import { Link2, LogIn, ArrowRight, Loader2, AlertTriangle, X } from "lucide-react";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { GroupAvatar } from "./GroupAvatar";

type Preview = {
  nome: string;
  descricao?: string;
  pictureUrl?: string | null;
  totalMembros: number;
};

type Props = {
  instancias: Array<{ name: string }>;
  onEntered: () => void; // reload da lista
};

export function JoinGroupCard({ instancias, onEntered }: Props) {
  const [instanceName, setInstanceName] = useState(instancias[0]?.name ?? "");
  const [inviteUrl, setInviteUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [joining, setJoining] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setErro(null);
    setSucesso(null);
  }

  async function fetchPreview() {
    reset();
    if (!instanceName || !inviteUrl.includes("chat.whatsapp.com/")) {
      setErro("Cole um link válido e selecione uma instância.");
      return;
    }
    setLoadingPreview(true);
    try {
      const qs = new URLSearchParams({ instanceName, inviteUrl });
      const res = await fetch(`/api/grupos/preview?${qs}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPreview(data as Preview);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function entrar() {
    if (!preview) return;
    setJoining(true);
    setErro(null);
    try {
      const res = await fetch(`/api/grupos/entrar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName, inviteUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSucesso(`Entrou em "${preview.nome}"`);
      setPreview(null);
      setInviteUrl("");
      onEntered();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setJoining(false);
    }
  }

  return (
    <GlassCard strong className="mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Link2 className="h-4 w-4 text-[#FF0033]" />
        <h2 className="text-sm font-semibold tracking-wide">Entrar em novo grupo</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-[180px,1fr,auto]">
        <label className="flex flex-col gap-1.5 w-full">
          <span className="text-xs font-medium uppercase tracking-widest text-zinc-300">
            Instância
          </span>
          <select
            value={instanceName}
            onChange={(e) => {
              setInstanceName(e.target.value);
              reset();
            }}
            className="h-10 rounded-md bg-black/40 border border-white/10 px-3 text-sm text-zinc-100 focus:border-[#FF0033] focus:outline-none"
          >
            {instancias.length === 0 && <option value="">Nenhuma</option>}
            {instancias.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name}
              </option>
            ))}
          </select>
        </label>

        <NeonInput
          label="Link do grupo"
          placeholder="https://chat.whatsapp.com/XXXXXX"
          value={inviteUrl}
          onChange={(e) => {
            setInviteUrl(e.target.value);
            if (preview) setPreview(null);
          }}
        />

        <div className="flex items-end">
          <NeonButton
            variant="outline"
            onClick={fetchPreview}
            disabled={loadingPreview || !instanceName || !inviteUrl}
            className="h-10"
          >
            {loadingPreview ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Verificando…</span>
              </>
            ) : (
              <>
                <ArrowRight className="h-3.5 w-3.5" />
                <span>Preview</span>
              </>
            )}
          </NeonButton>
        </div>
      </div>

      {erro && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/[0.07] px-3 py-2 text-xs text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={() => setErro(null)} aria-label="Fechar">
            <X className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}
      {sucesso && (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-200">
          <span className="flex-1">✅ {sucesso}</span>
          <button onClick={() => setSucesso(null)} aria-label="Fechar">
            <X className="h-3.5 w-3.5 opacity-60 hover:opacity-100" />
          </button>
        </div>
      )}

      {preview && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-[#FF0033]/20 bg-[#FF0033]/[0.05] p-3">
          <GroupAvatar nome={preview.nome} pictureUrl={preview.pictureUrl} size="lg" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-white truncate">{preview.nome}</p>
            {preview.descricao && (
              <p className="text-xs text-zinc-400 line-clamp-2 mt-0.5">
                {preview.descricao}
              </p>
            )}
            <p className="text-[11px] text-zinc-500 mt-1">
              {preview.totalMembros} {preview.totalMembros === 1 ? "membro" : "membros"}
            </p>
          </div>
          <NeonButton onClick={entrar} disabled={joining} variant="primary">
            {joining ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Entrando…</span>
              </>
            ) : (
              <>
                <LogIn className="h-3.5 w-3.5" />
                <span>Entrar</span>
              </>
            )}
          </NeonButton>
        </div>
      )}
    </GlassCard>
  );
}

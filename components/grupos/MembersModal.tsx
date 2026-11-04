"use client";
// Modal com membros do grupo. Virtualização simples por paginação
// (slice do array por página de 50) — suficiente até ~2000 membros.
// Pra listas maiores precisaria react-virtual, mas isso é raro em
// grupos reais do WhatsApp (limite oficial é 1024).
import { useEffect, useMemo, useState } from "react";
import { X, Users, Download, Loader2, Shield } from "lucide-react";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";

type Membro = {
  telefone: string;
  pushName?: string | null;
  admin?: boolean;
};

type Props = {
  grupoId: string;
  grupoNome: string;
  open: boolean;
  onClose: () => void;
  onImported: (listaId: string) => void;
};

const PAGE = 50;

export function MembersModal({ grupoId, grupoNome, open, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [filtro, setFiltro] = useState("");
  const [pagina, setPagina] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [nomeLista, setNomeLista] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setLoading(true);
    setErro(null);
    fetch(`/api/grupos/${grupoId}/membros`, { cache: "no-store" })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        if (!cancelado) setMembros(data.membros ?? []);
      })
      .catch((e) => {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });
    return () => {
      cancelado = true;
    };
  }, [open, grupoId]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return membros;
    return membros.filter(
      (m) =>
        m.telefone.includes(q) ||
        (m.pushName ?? "").toLowerCase().includes(q)
    );
  }, [membros, filtro]);

  const paginados = useMemo(
    () => filtrados.slice(0, (pagina + 1) * PAGE),
    [filtrados, pagina]
  );

  async function importar() {
    setImporting(true);
    setErro(null);
    try {
      const nome = nomeLista.trim() || `${grupoNome} — membros`;
      const res = await fetch(`/api/grupos/${grupoId}/importar-como-lista`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomeLista: nome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onImported(data.listaId);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-xl border border-white/10 bg-zinc-950 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <Users className="h-4 w-4 text-[#FF0033] shrink-0" />
            <h3 className="text-sm font-semibold truncate">Membros · {grupoNome}</h3>
            <span className="text-xs text-zinc-500">({membros.length})</span>
          </div>
          <button onClick={onClose} className="text-zinc-400 hover:text-white" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
          <NeonInput
            placeholder="Buscar por telefone ou nome"
            value={filtro}
            onChange={(e) => {
              setFiltro(e.target.value);
              setPagina(0);
            }}
          />
          <NeonButton
            variant="outline"
            onClick={() => setImportOpen((v) => !v)}
            disabled={membros.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Importar como lista</span>
          </NeonButton>
        </div>

        {importOpen && (
          <div className="px-5 py-3 border-b border-white/10 bg-black/30 flex items-end gap-3">
            <NeonInput
              label="Nome da nova lista"
              placeholder={`${grupoNome} — membros`}
              value={nomeLista}
              onChange={(e) => setNomeLista(e.target.value)}
            />
            <NeonButton onClick={importar} disabled={importing} variant="primary">
              {importing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Importando…</span>
                </>
              ) : (
                <span>Confirmar</span>
              )}
            </NeonButton>
          </div>
        )}

        {erro && (
          <div className="px-5 py-2 bg-rose-500/[0.07] text-xs text-rose-300 border-b border-rose-500/20">
            {erro}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-white/[0.03] animate-pulse" />
              ))}
            </div>
          ) : filtrados.length === 0 ? (
            <div className="p-10 text-center text-sm text-zinc-500">
              Nenhum membro {filtro ? "corresponde ao filtro" : "no grupo"}.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-zinc-950 border-b border-white/10">
                <tr className="text-left text-[11px] uppercase tracking-widest text-zinc-500">
                  <th className="px-5 py-2 font-medium">Telefone</th>
                  <th className="px-5 py-2 font-medium">Nome</th>
                  <th className="px-5 py-2 font-medium w-16"> </th>
                </tr>
              </thead>
              <tbody>
                {paginados.map((m, i) => (
                  <tr key={`${m.telefone}-${i}`} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-5 py-2 font-mono text-xs text-zinc-200">{m.telefone}</td>
                    <td className="px-5 py-2 text-zinc-400 truncate max-w-[260px]">
                      {m.pushName || <span className="text-zinc-600">—</span>}
                    </td>
                    <td className="px-5 py-2 text-right">
                      {m.admin && (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-amber-300">
                          <Shield className="h-3 w-3" /> admin
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {paginados.length < filtrados.length && (
            <div className="p-3 text-center">
              <button
                className="text-xs text-zinc-400 hover:text-white"
                onClick={() => setPagina((p) => p + 1)}
              >
                Carregar mais ({filtrados.length - paginados.length} restantes)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";

type Props = {
  onMenuClick?: () => void;
  onToggleCollapse?: () => void;
  collapsed?: boolean;
};

// Mapa pathname → breadcrumb humano. Mantém o topo informativo (pra onde o
// usuário olha quando entra num subflow tipo /campanhas/:id).
const titleMap: Array<[RegExp, string]> = [
  [/^\/$/, "Dashboard"],
  [/^\/numeros/, "Instâncias"],
  [/^\/contatos/, "Base"],
  [/^\/listas\/[^/]+$/, "Detalhes da lista"],
  [/^\/listas/, "Listas"],
  [/^\/campanhas\/nova/, "Nova campanha"],
  [/^\/campanhas\/[^/]+$/, "Detalhes da campanha"],
  [/^\/campanhas/, "Campanhas"],
  [/^\/configuracoes/, "Configurações"],
];

function currentTitle(path: string): string {
  for (const [re, title] of titleMap) if (re.test(path)) return title;
  return "ZapFire";
}

export function Topbar({ onMenuClick, onToggleCollapse, collapsed }: Props) {
  const pathname = usePathname();
  const title = currentTitle(pathname);

  return (
    <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(5,5,7,0.72)] border-b border-white/[0.05] px-4 md:px-8 h-14 flex items-center gap-3">
      {/* Trigger mobile */}
      <button
        onClick={onMenuClick}
        className="md:hidden h-9 w-9 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors"
        aria-label="Abrir menu"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Trigger desktop — colapsar/expandir sidebar */}
      <button
        onClick={onToggleCollapse}
        className="hidden md:flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-white/[0.04] transition-colors"
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        title={collapsed ? "Expandir menu" : "Recolher menu"}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </button>

      {/* Breadcrumb / título da página */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-[0.22em] text-zinc-600 font-medium">
          ZapFire
        </span>
        <span className="text-zinc-700">/</span>
        <span className="text-sm font-medium text-zinc-200 truncate">
          {title}
        </span>
      </div>

      {/* Espaço flex pra empurrar status indicator à direita se precisar */}
      <div className="flex-1" />

      {/* Dot verde minimalista de status da API — única coisa no lado direito */}
      <div className="hidden sm:flex items-center gap-2 text-[11px] text-zinc-500">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-70 animate-ping" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
        </span>
        <span className="tabular-nums">Online</span>
      </div>
    </header>
  );
}

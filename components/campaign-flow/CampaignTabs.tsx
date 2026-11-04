"use client";
// Barra de tabs minimalista pra navegar entre as sub-rotas da campanha.
// Reusa estética do app (border inferior destacado em vermelho).
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "overview" | "sequencia" | "contatos";

type Props = {
  id: string;
  active: Tab;
};

const TABS: Array<{ key: Tab; label: string; href: (id: string) => string }> = [
  { key: "overview", label: "Visão geral", href: (id) => `/campanhas/${id}` },
  { key: "sequencia", label: "Sequência", href: (id) => `/campanhas/${id}/sequencia` },
  { key: "contatos", label: "Base", href: (id) => `/campanhas/${id}/contatos` },
];

export function CampaignTabs({ id, active }: Props) {
  return (
    <div className="flex items-center gap-1 border-b border-white/[0.06] mb-4">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href(id)}
          className={cn(
            "relative px-3 py-2 text-sm transition-colors",
            active === t.key
              ? "text-white"
              : "text-zinc-400 hover:text-zinc-200"
          )}
        >
          {t.label}
          {active === t.key && (
            <span className="absolute inset-x-0 -bottom-[1px] h-[2px] rounded-full bg-[#FF0033]" />
          )}
        </Link>
      ))}
    </div>
  );
}

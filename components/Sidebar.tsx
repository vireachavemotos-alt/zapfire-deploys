"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Smartphone,
  Users,
  UsersRound,
  ListChecks,
  Rocket,
  Settings,
  LogOut,
  FileStack,
  Ban,
  Flame,
  X,
} from "lucide-react";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/numeros", label: "Instâncias", icon: Smartphone },
  { href: "/aquecimento", label: "Aquecimento", icon: Flame },
  { href: "/contatos", label: "Base", icon: Users },
  { href: "/grupos", label: "Grupos", icon: UsersRound },
  { href: "/listas", label: "Listas", icon: ListChecks },
  { href: "/campanhas", label: "Campanhas", icon: Rocket },
  { href: "/templates", label: "Templates", icon: FileStack },
  { href: "/blacklist", label: "Blacklist", icon: Ban },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

type Props = {
  open?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
};

export function Sidebar({ open = false, onClose, collapsed = false }: Props) {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile backdrop com fade */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed md:sticky top-0 left-0 z-50 h-screen shrink-0 flex flex-col",
          "bg-[var(--surface-1)] border-r border-white/[0.05]",
          "transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          // largura: mobile sempre 240, desktop depende do collapsed
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          collapsed ? "md:w-[68px] w-60" : "w-60"
        )}
      >
        {/* Logo */}
        <div
          className={cn(
            "pt-5 pb-4 flex items-center border-b border-white/[0.05]",
            collapsed ? "md:px-2 px-3 justify-center md:justify-center" : "px-3"
          )}
        >
          <Link
            href="/"
            className={cn(
              "flex items-center min-w-0",
              collapsed ? "md:justify-center flex-1" : "flex-1"
            )}
            onClick={onClose}
          >
            {collapsed ? (
              <Image
                src="/logo-mark.png"
                alt="ZapFire"
                width={648}
                height={621}
                priority
                className="hidden md:block h-10 w-10 object-contain drop-shadow-[0_0_8px_rgba(255,0,51,0.25)]"
              />
            ) : (
              <Image
                src="/logo.png"
                alt="ZapFire"
                width={580}
                height={200}
                priority
                className="h-14 w-auto max-w-full"
              />
            )}
            {/* Mobile sempre mostra o logo completo, mesmo se collapsed no desktop */}
            {collapsed && (
              <Image
                src="/logo.png"
                alt="ZapFire"
                width={580}
                height={200}
                priority
                className="md:hidden h-14 w-auto max-w-full"
              />
            )}
          </Link>
          <button
            onClick={onClose}
            className="md:hidden text-zinc-500 hover:text-white shrink-0 ml-2"
            aria-label="Fechar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav */}
        <nav
          className={cn(
            "flex-1 py-3 flex flex-col gap-0.5 overflow-y-auto",
            collapsed ? "md:px-2 px-2" : "px-2"
          )}
        >
          {items.map((it) => {
            const active =
              it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
            const Icon = it.icon;

            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onClose}
                title={collapsed ? it.label : undefined}
                className={cn(
                  "group relative flex items-center rounded-md text-sm font-medium",
                  "transition-all duration-200 ease-out",
                  collapsed
                    ? "md:justify-center md:px-0 md:h-10 md:w-full px-3 py-2 gap-2.5"
                    : "px-3 py-2 gap-2.5",
                  active
                    ? "text-white bg-gradient-to-r from-[#FF0033]/[0.14] to-[#FF0033]/[0.02]"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.03]"
                )}
              >
                {/* Indicador ativo à esquerda */}
                {active && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-gradient-to-b from-[#FF0033] to-[#FF3355]" />
                )}
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-colors",
                    active ? "text-[#FF3355]" : "text-zinc-500 group-hover:text-zinc-300"
                  )}
                />
                <span
                  className={cn(
                    "whitespace-nowrap transition-opacity",
                    collapsed ? "md:opacity-0 md:hidden opacity-100" : "opacity-100"
                  )}
                >
                  {it.label}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/[0.05]">
          <div
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-2",
              collapsed && "md:justify-center"
            )}
          >
            <div className="h-7 w-7 rounded-md bg-gradient-to-br from-[#FF0033]/20 to-[#FF0033]/5 border border-[#FF0033]/30 flex items-center justify-center text-[10px] font-semibold text-[#FF3355] shrink-0">
              TL
            </div>
            <div
              className={cn(
                "flex-1 min-w-0 transition-opacity",
                collapsed ? "md:hidden" : ""
              )}
            >
              <p className="text-xs font-medium truncate">Thiago Lira</p>
              <p className="text-[10px] text-zinc-500 truncate">
                Plano Pro · 5 números
              </p>
            </div>
            <button
              className={cn(
                "text-zinc-500 hover:text-white transition-colors",
                collapsed && "md:hidden"
              )}
              aria-label="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

"use client";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { StoreHydrator } from "@/components/StoreHydrator";

const COLLAPSE_KEY = "zapfire:sidebar-collapsed";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mobile: drawer abre/fecha. Desktop: sidebar sempre visível, só colapsa.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();

  // Hidrata preferência de colapsamento do localStorage (só desktop).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(COLLAPSE_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* SSR / private mode: ignora */
    }
    setHydrated(true);
  }, []);

  function toggleCollapse() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* noop */
      }
      return next;
    });
  }

  return (
    <StoreHydrator>
      <div className="flex min-h-screen">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={hydrated && collapsed}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar
            onMenuClick={() => setSidebarOpen(true)}
            onToggleCollapse={toggleCollapse}
            collapsed={hydrated && collapsed}
          />
          {/* key={pathname} força remontagem e replay da animação a cada rota */}
          <main
            key={pathname}
            className="flex-1 px-4 py-5 sm:px-6 sm:py-7 md:px-8 md:py-8 animate-fade-up"
          >
            {children}
          </main>
        </div>
      </div>
    </StoreHydrator>
  );
}

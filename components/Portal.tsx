"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Monta os children fora do DOM tree do componente pai, direto no document.body.
 *
 * Por que: qualquer ancestral com `transform`, `filter` ou `animation` cria
 * um novo "containing block" pra position:fixed — se um modal estiver dentro
 * desse ancestral, o fixed vira "fixed relativo ao ancestral", o que quebra
 * visualmente (foi exatamente o que aconteceu com o BulkPasteModal renderizado
 * dentro do <main className="animate-fade-up">).
 *
 * Renderiza null no primeiro render (SSR) pra evitar hydration mismatch.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

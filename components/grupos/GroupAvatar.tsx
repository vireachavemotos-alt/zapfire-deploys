"use client";
// Avatar circular com fallback por iniciais, mimetiza o visual do
// InstanceAvatar da página /numeros pra manter consistência.
import { useState } from "react";

type Props = {
  nome: string;
  pictureUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

const SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "h-8 w-8 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
};

export function GroupAvatar({ nome, pictureUrl, size = "md" }: Props) {
  const [broken, setBroken] = useState(false);
  const cls = SIZES[size];
  if (pictureUrl && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={pictureUrl}
        alt={nome}
        onError={() => setBroken(true)}
        className={`${cls} rounded-md object-cover border border-white/10 bg-black shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${cls} rounded-md bg-[#FF0033]/10 border border-[#FF0033]/30 text-[#FF0033] flex items-center justify-center font-semibold uppercase shrink-0`}
    >
      {nome.slice(0, 2)}
    </div>
  );
}

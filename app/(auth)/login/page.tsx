"use client";
import Image from "next/image";
import { GlassCard } from "@/components/GlassCard";
import { NeonButton } from "@/components/NeonButton";
import { NeonInput } from "@/components/NeonInput";
import { Lock, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden px-4">
      {/* glow background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 h-[520px] w-[520px] rounded-full bg-[#FF0033] opacity-20 blur-[140px]" />
        <div className="absolute bottom-10 right-10 h-[300px] w-[300px] rounded-full bg-[#D50000] opacity-25 blur-[120px]" />
      </div>

      <GlassCard strong className="w-full max-w-md p-8 md:p-10">
        {/* Logo */}
        <div className="flex flex-col items-center text-center mb-8">
          <Image
            src="/logo.png"
            alt="ZapFire"
            width={580}
            height={200}
            priority
            className="h-16 w-auto"
          />
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-3">
            Disparo em Massa · WhatsApp
          </p>
        </div>

        {/* Form */}
        <form className="flex flex-col gap-4">
          <NeonInput
            label="E-mail"
            placeholder="voce@empresa.com.br"
            icon={<Mail className="h-4 w-4" />}
            type="email"
          />
          <NeonInput
            label="Senha"
            placeholder="••••••••••"
            icon={<Lock className="h-4 w-4" />}
            type="password"
          />

          <div className="flex items-center justify-between text-xs mt-1">
            <label className="flex items-center gap-2 text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                className="accent-[#FF0033] h-3.5 w-3.5"
                defaultChecked
              />
              Manter conectado
            </label>
            <Link
              href="#"
              className="text-neon/80 hover:text-neon hover:underline"
            >
              Esqueci a senha
            </Link>
          </div>

          <Link href="/" className="mt-2">
            <NeonButton
              type="button"
              className="w-full"
              size="lg"
              pulsing
            >
              🔥 Entrar no painel
            </NeonButton>
          </Link>
        </form>

        <div className="neon-divider my-6" />

        <div className="flex items-center justify-center gap-2 text-[11px] text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-neon/70" />
          Conexão criptografada ponta a ponta
        </div>

        <p className="text-center text-xs text-zinc-500 mt-6">
          Não tem conta?{" "}
          <Link href="#" className="text-neon hover:underline">
            Criar conta grátis
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Inter é a escolha padrão de produto SaaS premium (Linear, Vercel, Stripe) —
// tipografia sans neutra, altíssima legibilidade, weights consistentes.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

// Mono fica reservado pra números tabulares, códigos, timestamps.
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ZapFire — Disparo em Massa WhatsApp",
  description:
    "Painel profissional de prospecção ativa e disparo multi-número no WhatsApp.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

// Viewport export (Next 14): preenche o notch do iPhone e trava o zoom
// involuntário quando o usuário dá tap em input (iOS zoom-on-focus).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050507",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body
        className={`${inter.variable} ${jetbrains.variable} font-sans antialiased text-zinc-100`}
      >
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(14,14,16,0.92)",
              border: "1px solid rgba(255,255,255,0.06)",
              backdropFilter: "blur(12px)",
              color: "#e4e4e7",
              fontFamily: "var(--font-sans)",
            },
          }}
        />
      </body>
    </html>
  );
}

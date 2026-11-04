/** @type {import('next').NextConfig} */
const nextConfig = {
  // Liga o hook `instrumentation.ts` — usamos ele pra bootar o scheduler
  // de campanhas agendadas quando o server sobe.
  experimental: {
    instrumentationHook: true,
  },
  // Output `standalone` empacota só o que precisa pra rodar (sem
  // node_modules inteiro). Reduz a imagem Docker de ~600MB pra ~150MB.
  output: "standalone",
};

export default nextConfig;

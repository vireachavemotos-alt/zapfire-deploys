// Curva de progressão do aquecimento. Dia 1 = 5 msg/dia, cresce
// logística até dia 30 ≈ 100. Simula aquecimento humano: evita picos
// bruscos que o anti-spam do WhatsApp detecta como bot.

export function calcLimiteDiario(diasAtivo: number): number {
  if (diasAtivo <= 0) return 5;
  // Pontos de ancoragem suaves (y = a + (b-a) / (1 + e^(-k*(x-x0))))
  // dia 1=5, dia 3=10, dia 7=40, dia 14=70, dia 30=100.
  const anchors: Array<[number, number]> = [
    [1, 5],
    [3, 10],
    [7, 40],
    [14, 70],
    [30, 100],
  ];
  // Interpolação linear entre pontos — simples e previsível.
  if (diasAtivo >= 30) return 100;
  for (let i = 0; i < anchors.length - 1; i++) {
    const [x1, y1] = anchors[i];
    const [x2, y2] = anchors[i + 1];
    if (diasAtivo >= x1 && diasAtivo <= x2) {
      const t = (diasAtivo - x1) / (x2 - x1);
      return Math.round(y1 + (y2 - y1) * t);
    }
  }
  return 5;
}

/** Intervalo (ms) entre envios considerando o limite diário.
 *  Distribui `limiteDiario` ao longo de 14h (6h-20h) e adiciona
 *  jitter de ±30% pra parecer humano. */
export function intervaloEntreEnvios(limiteDiario: number): number {
  const janelaMinutos = 14 * 60;
  const base = Math.max(10, Math.floor(janelaMinutos / Math.max(1, limiteDiario)));
  const jitter = base * (Math.random() * 0.6 - 0.3);
  return Math.max(10 * 60_000, Math.floor((base + jitter) * 60_000));
}

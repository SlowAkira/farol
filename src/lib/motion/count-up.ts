// Interpolacao da contagem de KPI. Vive em src/lib porque e funcao pura, pela
// mesma regra que mantem divisao de numero fora de componente.

export const MOVIMENTO_REDUZIDO = "(prefers-reduced-motion: reduce)";

const MILISSEGUNDOS_POR_SEGUNDO = 1000;

// Desacelera no fim: a contagem chega perto do valor rapido e assenta devagar,
// que e o que faz o numero parecer pousar em vez de travar.
export function easeOutCubic(progresso: number): number {
  const t = Math.min(1, Math.max(0, progresso));
  return 1 - (1 - t) ** 3;
}

// Sempre parte de zero e termina exatamente no alvo -- nao num arredondamento
// perto dele. Alvo negativo conta para baixo pelo mesmo caminho.
export function countUpValue(alvo: number, decorridoMs: number, duracaoMs: number): number {
  if (duracaoMs <= 0 || decorridoMs >= duracaoMs) {
    return alvo;
  }
  if (decorridoMs <= 0) {
    return 0;
  }

  return alvo * easeOutCubic(decorridoMs / duracaoMs);
}

// Le a duracao do token CSS (`--motion-count: 600ms`) em vez de repetir o numero
// no TypeScript: com duas copias, mexer no token deixa o movimento fora de passo
// com o resto da interface sem nada acusar.
export function parseCssDuration(valor: string, padraoMs: number): number {
  const texto = valor.trim();
  const numero = Number.parseFloat(texto);
  if (Number.isNaN(numero)) {
    return padraoMs;
  }

  return texto.endsWith("ms") ? numero : numero * MILISSEGUNDOS_POR_SEGUNDO;
}

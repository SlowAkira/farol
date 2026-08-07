import { metricValues, type MetricKey, type MetricTotals } from "./calc";

// Qual direcao e a boa. "neutral" nao e lacuna de preenchimento: gasto,
// impressoes e alcance subindo nao sao bons nem ruins por si so -- sao o tamanho
// da operacao, nao o resultado dela -- e pintar essa variacao de verde ou
// vermelho afirmaria um juizo que o numero sozinho nao sustenta.
export type BetterDirection = "higher" | "lower" | "neutral";

export type MetricComparison = {
  readonly current: number | null;
  readonly previous: number | null;
  readonly deltaAbsolute: number | null;
  readonly deltaPercent: number | null;
  readonly betterDirection: BetterDirection;
};

export type MetricsComparison = {
  readonly [K in MetricKey]: MetricComparison;
};

// Fica aqui, e nao em cada componente, porque e a unica fonte da verdade sobre
// qual cor a UI deve usar: custo caindo e bom, ROAS caindo e ruim.
const BETTER_DIRECTION: Record<MetricKey, BetterDirection> = {
  ctrPercent: "higher",
  cpcCents: "lower",
  cpmCents: "lower",
  cpaCents: "lower",
  roasRatio: "higher",
  // Frequencia nao tem lado bom monotonico: subindo demais e fadiga de criativo,
  // caindo demais e entrega insuficiente. O bom e uma faixa, nao uma direcao, e
  // pintar de verde qualquer um dos extremos mentiria. Antes de existir
  // changeTone isto era `lowerIsBetter: false`, que ninguem lia; agora leria, e
  // pintaria fadiga de verde.
  frequencyRatio: "neutral",
  impressions: "neutral",
  clicks: "neutral",
  spendCents: "neutral",
  conversions: "higher",
  conversionValueCents: "higher",
  reach: "neutral",
};

function compareValue(
  current: number | null,
  previous: number | null,
  betterDirection: BetterDirection,
): MetricComparison {
  const deltaAbsolute = current === null || previous === null ? null : current - previous;

  // Percentual de variacao sobre base zero nao tem significado (e sempre
  // "infinito" ou indefinido), entao vira null como qualquer outra divisao
  // por zero em src/lib/metrics.
  const deltaPercent =
    deltaAbsolute === null || previous === null || previous === 0
      ? null
      : (deltaAbsolute / previous) * 100;

  return { current, previous, deltaAbsolute, deltaPercent, betterDirection };
}

export function compareMetrics(
  currentTotals: MetricTotals,
  previousTotals: MetricTotals,
): MetricsComparison {
  const current = metricValues(currentTotals);
  const previous = metricValues(previousTotals);

  const result: Record<MetricKey, MetricComparison> = {} as Record<MetricKey, MetricComparison>;
  for (const key of Object.keys(BETTER_DIRECTION) as MetricKey[]) {
    result[key] = compareValue(current[key], previous[key], BETTER_DIRECTION[key]);
  }
  return result;
}

// Verde/vermelho saem daqui, nao do sinal do delta: cair 10% no CPA e melhora e
// subir 10% no CPA e piora, e o componente so pergunta o resultado.
export type ChangeTone = "positive" | "negative" | "neutral";

export function changeTone(comparison: MetricComparison): ChangeTone {
  const { deltaAbsolute, betterDirection } = comparison;

  if (deltaAbsolute === null || deltaAbsolute === 0 || betterDirection === "neutral") {
    return "neutral";
  }

  const improved = betterDirection === "higher" ? deltaAbsolute > 0 : deltaAbsolute < 0;
  return improved ? "positive" : "negative";
}

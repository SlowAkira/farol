import { computeMetrics, type Metrics, type MetricTotals } from "./calc";

export type MetricComparison = {
  readonly current: number | null;
  readonly previous: number | null;
  readonly deltaAbsolute: number | null;
  readonly deltaPercent: number | null;
  readonly lowerIsBetter: boolean;
};

export type MetricsComparison = {
  readonly [K in keyof Metrics]: MetricComparison;
};

// Fica aqui, e nao em cada componente, porque e a unica fonte da verdade sobre
// qual cor a UI deve usar: custo caindo e bom, ROAS caindo e ruim.
const LOWER_IS_BETTER: Record<keyof Metrics, boolean> = {
  ctrPercent: false,
  cpcCents: true,
  cpmCents: true,
  cpaCents: true,
  roasRatio: false,
  frequencyRatio: false,
};

function compareValue(
  current: number | null,
  previous: number | null,
  lowerIsBetter: boolean,
): MetricComparison {
  const deltaAbsolute = current === null || previous === null ? null : current - previous;

  // Percentual de variacao sobre base zero nao tem significado (e sempre
  // "infinito" ou indefinido), entao vira null como qualquer outra divisao
  // por zero em src/lib/metrics.
  const deltaPercent =
    deltaAbsolute === null || previous === null || previous === 0
      ? null
      : (deltaAbsolute / previous) * 100;

  return { current, previous, deltaAbsolute, deltaPercent, lowerIsBetter };
}

export function compareMetrics(
  currentTotals: MetricTotals,
  previousTotals: MetricTotals,
): MetricsComparison {
  const current = computeMetrics(currentTotals);
  const previous = computeMetrics(previousTotals);

  const result: Record<keyof Metrics, MetricComparison> = {} as Record<
    keyof Metrics,
    MetricComparison
  >;
  for (const key of Object.keys(LOWER_IS_BETTER) as (keyof Metrics)[]) {
    result[key] = compareValue(current[key], previous[key], LOWER_IS_BETTER[key]);
  }
  return result;
}

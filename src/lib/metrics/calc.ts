export type MetricTotals = {
  readonly impressions: number;
  readonly clicks: number;
  readonly spendCents: number;
  readonly conversions: number;
  readonly conversionValueCents: number;
  readonly reach: number;
};

export type Metrics = {
  readonly ctrPercent: number | null;
  readonly cpcCents: number | null;
  readonly cpmCents: number | null;
  readonly cpaCents: number | null;
  readonly roasRatio: number | null;
  readonly frequencyRatio: number | null;
};

// Zero no denominador nao tem metrica que faca sentido (nao e "custo zero"),
// entao devolve null em vez de NaN ou Infinity, que quebrariam qualquer soma
// ou renderizacao rio abaixo.
function safeDivide(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function ctr(clicks: number, impressions: number): number | null {
  const ratio = safeDivide(clicks, impressions);
  return ratio === null ? null : ratio * 100;
}

export function cpc(spendCents: number, clicks: number): number | null {
  return safeDivide(spendCents, clicks);
}

export function cpm(spendCents: number, impressions: number): number | null {
  const perImpression = safeDivide(spendCents, impressions);
  return perImpression === null ? null : perImpression * 1000;
}

export function cpa(spendCents: number, conversions: number): number | null {
  return safeDivide(spendCents, conversions);
}

export function roas(conversionValueCents: number, spendCents: number): number | null {
  return safeDivide(conversionValueCents, spendCents);
}

export function frequency(impressions: number, reach: number): number | null {
  return safeDivide(impressions, reach);
}

export function computeMetrics(totals: MetricTotals): Metrics {
  return {
    ctrPercent: ctr(totals.clicks, totals.impressions),
    cpcCents: cpc(totals.spendCents, totals.clicks),
    cpmCents: cpm(totals.spendCents, totals.impressions),
    cpaCents: cpa(totals.spendCents, totals.conversions),
    roasRatio: roas(totals.conversionValueCents, totals.spendCents),
    frequencyRatio: frequency(totals.impressions, totals.reach),
  };
}

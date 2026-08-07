import type { MetricKey } from "./calc";

// Como o numero deve ser lido, nao como ele deve ser escrito: a formatacao em si
// (locale, moeda, abreviacao) mora em src/lib/format.ts. Aqui fica so a natureza
// da grandeza, que e o que decide qual formatador chamar.
export type MetricUnit = "currency" | "count" | "ratio" | "percent";

export type MetricDefinition = {
  readonly key: MetricKey;
  readonly label: string;
  readonly unit: MetricUnit;
};

// Ordem e a da leitura do painel: quanto se gastou, o que voltou, quanto custou
// cada resultado, quantos resultados houve e o quanto o anuncio engajou.
export const DASHBOARD_METRICS = [
  { key: "spendCents", label: "Gasto", unit: "currency" },
  { key: "roasRatio", label: "ROAS", unit: "ratio" },
  { key: "cpaCents", label: "CPA", unit: "currency" },
  { key: "conversions", label: "Conversões", unit: "count" },
  { key: "ctrPercent", label: "CTR", unit: "percent" },
] as const satisfies readonly MetricDefinition[];

export type DashboardMetricKey = (typeof DASHBOARD_METRICS)[number]["key"];

export function metricDefinition(key: DashboardMetricKey): MetricDefinition {
  const definition = DASHBOARD_METRICS.find((candidate) => candidate.key === key);
  if (!definition) {
    throw new Error(`Metrica "${key}" nao esta no catalogo do painel.`);
  }
  return definition;
}

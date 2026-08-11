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

// Nome e unidade de toda metrica que existe, num lugar so. Cada tela escolhe um
// subconjunto daqui em vez de repetir o rotulo: "Gasto" escrito em dois arquivos
// vira "Gasto" e "Investimento" na primeira vez que alguem mexer so num deles.
// O `satisfies Record<MetricKey, ...>` cobra a lista completa -- metrica nova em
// calc.ts sem entrada aqui nao compila.
const CATALOGO = {
  spendCents: { key: "spendCents", label: "Gasto", unit: "currency" },
  impressions: { key: "impressions", label: "Impressões", unit: "count" },
  clicks: { key: "clicks", label: "Cliques", unit: "count" },
  reach: { key: "reach", label: "Alcance", unit: "count" },
  conversions: { key: "conversions", label: "Conversões", unit: "count" },
  conversionValueCents: {
    key: "conversionValueCents",
    label: "Valor de conversão",
    unit: "currency",
  },
  ctrPercent: { key: "ctrPercent", label: "CTR", unit: "percent" },
  cpcCents: { key: "cpcCents", label: "CPC", unit: "currency" },
  cpmCents: { key: "cpmCents", label: "CPM", unit: "currency" },
  cpaCents: { key: "cpaCents", label: "CPA", unit: "currency" },
  roasRatio: { key: "roasRatio", label: "ROAS", unit: "ratio" },
  frequencyRatio: { key: "frequencyRatio", label: "Frequência", unit: "ratio" },
} as const satisfies Record<MetricKey, MetricDefinition>;

export function metricDefinition<K extends MetricKey>(key: K): (typeof CATALOGO)[K] {
  return CATALOGO[key];
}

// Ordem e a da leitura do painel: quanto se gastou, o que voltou, quanto custou
// cada resultado, quantos resultados houve e o quanto o anuncio engajou.
export const DASHBOARD_METRICS = [
  CATALOGO.spendCents,
  CATALOGO.roasRatio,
  CATALOGO.cpaCents,
  CATALOGO.conversions,
  CATALOGO.ctrPercent,
] as const;

export type DashboardMetricKey = (typeof DASHBOARD_METRICS)[number]["key"];

// A tabela de campanhas segue o funil, e nao a importancia: entrega (gasto,
// impressoes), reacao (cliques, CTR, CPM) e resultado (conversoes, CPA, ROAS).
// Quem varre a linha da esquerda para a direita acompanha o caminho do dinheiro.
export const CAMPAIGN_TABLE_METRICS = [
  CATALOGO.spendCents,
  CATALOGO.impressions,
  CATALOGO.clicks,
  CATALOGO.ctrPercent,
  CATALOGO.cpmCents,
  CATALOGO.conversions,
  CATALOGO.cpaCents,
  CATALOGO.roasRatio,
] as const;

export type CampaignTableMetricKey = (typeof CAMPAIGN_TABLE_METRICS)[number]["key"];

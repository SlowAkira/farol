import type { AlertComparison, AlertMetric } from "@/generated/prisma/enums";
import type { MetricKey, MetricTotals } from "@/lib/metrics/calc";
import { metricDefinition, type MetricDefinition } from "@/lib/metrics/catalog";

export type AlertMetricSpec = {
  // Ponte para src/lib/metrics: e por esta chave que o motor pega o valor da
  // metrica, em vez de recalcular a divisao por conta propria.
  readonly key: MetricKey;
  // Quanto multiplicar o valor da metrica para chegar na unidade do `threshold`.
  // Dinheiro nao escala porque cpaCents, cpmCents e spendCents ja devolvem
  // centavos; razao e percentual escalam por 100 porque chegam fracionarios e o
  // threshold e Int.
  readonly scale: number;
  // Total que sustenta a metrica. E ele, e nao a metrica, que diz se ha
  // evidencia suficiente: CPA de R$ 50,00 sobre 2 conversoes e ruido.
  readonly volumeField: keyof MetricTotals;
  readonly minimumVolume: number;
};

// Variacao percentual e sempre percentual, qualquer que seja a metrica que
// variou: 30% vira 3000 tanto para CPA quanto para ROAS.
const PCT_CHANGE_SCALE = 100;

const CENTAVOS = 1;
const CENTESIMOS = 100;

// Unica fonte da verdade sobre como ler o `threshold` de uma regra. O numero
// sozinho e ambiguo -- 250 e R$ 2,50 ou 2,5x? -- e sem um lugar so a resposta
// vira condicional espalhada pelo motor, pelo seed e pelo formulario. Quem
// precisa formatar o campo de entrada le daqui pelo mesmo caminho que o motor.
//
// O `satisfies Record<AlertMetric, ...>` cobra a lista inteira: metrica nova no
// enum sem escala e sem piso de volume aqui nao compila.
export const ALERT_METRICS = {
  CPA: {
    key: "cpaCents",
    scale: CENTAVOS,
    volumeField: "conversions",
    minimumVolume: 30,
  },
  CPM: {
    key: "cpmCents",
    scale: CENTAVOS,
    volumeField: "impressions",
    minimumVolume: 1_000,
  },
  // Total, e nao razao: nao tem denominador que o desestabilize, entao nao tem
  // piso de volume. O que protege gasto em PCT_CHANGE e a base zero, que o
  // proprio deltaPercent ja recusa.
  SPEND: {
    key: "spendCents",
    scale: CENTAVOS,
    volumeField: "spendCents",
    minimumVolume: 0,
  },
  // O piso e em conversoes, e nao em gasto: o que faz o ROAS pular nao e verba
  // pequena, e conversao escassa.
  ROAS: {
    key: "roasRatio",
    scale: CENTESIMOS,
    volumeField: "conversions",
    minimumVolume: 30,
  },
  CTR: {
    key: "ctrPercent",
    scale: CENTESIMOS,
    volumeField: "impressions",
    minimumVolume: 1_000,
  },
  FREQUENCY: {
    key: "frequencyRatio",
    scale: CENTESIMOS,
    volumeField: "reach",
    minimumVolume: 1_000,
  },
} as const satisfies Record<AlertMetric, AlertMetricSpec>;

export function alertMetricSpec(metric: AlertMetric): AlertMetricSpec {
  return ALERT_METRICS[metric];
}

// Rotulo e unidade saem do catalogo de metricas, e nao de uma copia aqui: "CPA"
// escrito em dois arquivos vira dois nomes diferentes na primeira vez que
// alguem mexer so num deles.
export function alertMetricDefinition(metric: AlertMetric): MetricDefinition {
  return metricDefinition(ALERT_METRICS[metric].key);
}

export function thresholdScale(metric: AlertMetric, comparison: AlertComparison): number {
  return comparison === "PCT_CHANGE" ? PCT_CHANGE_SCALE : ALERT_METRICS[metric].scale;
}

export function thresholdToValue(
  metric: AlertMetric,
  comparison: AlertComparison,
  threshold: number,
): number {
  return threshold / thresholdScale(metric, comparison);
}

export function valueToThreshold(
  metric: AlertMetric,
  comparison: AlertComparison,
  value: number,
): number {
  return Math.round(value * thresholdScale(metric, comparison));
}

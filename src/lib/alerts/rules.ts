import { createHash } from "node:crypto";
import {
  AlertComparison,
  AlertDirection,
  type AlertMetric,
  type AlertScope,
} from "@/generated/prisma/enums";
import type { Period } from "@/lib/db/insights";
import type { MetricTotals } from "@/lib/metrics/calc";
import { compareMetrics } from "@/lib/metrics/compare";
import { alertMetricSpec, thresholdScale } from "./metrics";

// So o que decide o disparo. A regra inteira tem nome, dono e conta, que nao
// entram na conta e so atrapalhariam quem monta um caso de teste.
export type EvaluableRule = {
  readonly id: string;
  readonly metric: AlertMetric;
  readonly comparison: AlertComparison;
  readonly direction: AlertDirection;
  readonly scope: AlertScope;
  readonly threshold: number;
  readonly windowDays: number;
};

export type AlertWindow = {
  readonly period: Period;
  readonly totals: MetricTotals;
};

export type AlertTarget = {
  readonly campaignId: string;
  readonly campaignName: string;
};

export type AlertWindowContext = {
  readonly period: Period;
  readonly value: number | null;
  readonly totals: MetricTotals;
};

export type AlertContext = {
  readonly metric: AlertMetric;
  readonly comparison: AlertComparison;
  readonly direction: AlertDirection;
  readonly scope: AlertScope;
  readonly threshold: number;
  readonly windowDays: number;
  readonly campaign: AlertTarget | null;
  readonly current: AlertWindowContext;
  readonly previous: AlertWindowContext;
  readonly deltaPercent: number | null;
};

// Tres motivos distintos para nao dar para medir, e nenhum deles e "a condicao
// deixou de valer": e por isso que inavaliavel nao resolve alerta aberto.
export type UnevaluableReason = "VOLUME_INSUFICIENTE" | "METRICA_INDISPONIVEL" | "BASE_ZERO";

export type RuleOutcome =
  | { readonly kind: "fired"; readonly context: AlertContext }
  | { readonly kind: "clear" }
  | { readonly kind: "unevaluable"; readonly reason: UnevaluableReason };

export type RuleEvaluation = {
  readonly rule: EvaluableRule;
  readonly target: AlertTarget | null;
  readonly current: AlertWindow;
  readonly previous: AlertWindow;
};

function unevaluable(reason: UnevaluableReason): RuleOutcome {
  return { kind: "unevaluable", reason };
}

// ABOVE dispara acima, BELOW dispara abaixo -- so que "abaixo" do que muda com a
// comparacao. Em ABSOLUTE_THRESHOLD o threshold e um nivel, e BELOW compara
// contra ele mesmo. Em PCT_CHANGE o threshold e a magnitude de um movimento, e
// "caiu mais que 20%" e comparar contra -20%. Guardar sempre magnitude positiva
// e o que deixa a mesma regra ler igual nos dois sentidos.
function firesAt(rule: EvaluableRule, scaled: number): boolean {
  if (rule.direction === AlertDirection.ABOVE) {
    return scaled > rule.threshold;
  }

  return scaled < (rule.comparison === AlertComparison.PCT_CHANGE ? -rule.threshold : rule.threshold);
}

export function evaluateRule({ rule, target, current, previous }: RuleEvaluation): RuleOutcome {
  const spec = alertMetricSpec(rule.metric);
  const comparaComAnterior = rule.comparison === AlertComparison.PCT_CHANGE;

  if (current.totals[spec.volumeField] < spec.minimumVolume) {
    return unevaluable("VOLUME_INSUFICIENTE");
  }

  // A janela anterior e o denominador da variacao: pouco volume la atras faz
  // qualquer oscilacao virar um percentual enorme. Em comparacao absoluta ela
  // nao entra na conta e nao pode calar o disparo.
  if (comparaComAnterior && previous.totals[spec.volumeField] < spec.minimumVolume) {
    return unevaluable("VOLUME_INSUFICIENTE");
  }

  const comparacao = compareMetrics(current.totals, previous.totals)[spec.key];

  if (comparacao.current === null) {
    return unevaluable("METRICA_INDISPONIVEL");
  }

  if (comparaComAnterior && comparacao.previous === null) {
    return unevaluable("METRICA_INDISPONIVEL");
  }

  const observado = comparaComAnterior ? comparacao.deltaPercent : comparacao.current;

  // So sobra um jeito de chegar aqui com null: deltaPercent sobre base zero.
  if (observado === null) {
    return unevaluable("BASE_ZERO");
  }

  // Arredonda para inteiro antes de comparar porque o threshold e inteiro e
  // porque 1.8 * 100 nao da exatamente 180 em ponto flutuante -- comparar float
  // com float faria o limiar exato disparar ou nao conforme o resto binario.
  const scaled = Math.round(observado * thresholdScale(rule.metric, rule.comparison));

  if (!firesAt(rule, scaled)) {
    return { kind: "clear" };
  }

  return {
    kind: "fired",
    context: {
      metric: rule.metric,
      comparison: rule.comparison,
      direction: rule.direction,
      scope: rule.scope,
      threshold: rule.threshold,
      windowDays: rule.windowDays,
      campaign: target,
      current: { period: current.period, value: comparacao.current, totals: current.totals },
      previous: { period: previous.period, value: comparacao.previous, totals: previous.totals },
      deltaPercent: comparacao.deltaPercent,
    },
  };
}

// Identidade da condicao, e nao do disparo: enquanto os tres campos forem os
// mesmos e existir um alerta aberto com este hash, a sincronizacao seguinte
// reconhece o problema como o mesmo em vez de abrir outro. A direcao entra
// porque inverter o sentido da regra e outro problema, nao o mesmo de antes.
export function fingerprintFor(
  ruleId: string,
  campaignId: string | null,
  direction: AlertDirection,
): string {
  // "|" nao aparece em cuid nem em enum do Prisma, entao nao ha par de entradas
  // diferentes que gere a mesma string concatenada.
  return createHash("sha256").update([ruleId, campaignId ?? "", direction].join("|")).digest("hex");
}

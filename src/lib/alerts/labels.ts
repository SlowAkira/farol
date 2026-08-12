import {
  AlertComparison,
  AlertDirection,
  AlertScope,
  type AlertMetric,
} from "@/generated/prisma/enums";
import { alertMetricDefinition, ALERT_METRICS } from "./metrics";
import { formatThresholdValue } from "./threshold";

// Como uma regra se le em portugues, e quais opcoes o formulario oferece. Fica
// fora do componente porque a mesma frase aparece na lista de regras, no preview
// e no cabecalho do formulario -- e porque frase e escolha de palavra, que da
// para testar, enquanto JSX nao.
//
// Nada aqui importa ./rules: aquele modulo puxa node:crypto pelo fingerprint, e
// o formulario e client. So os tipos do enum atravessam.

export type RuleShape = {
  readonly metric: AlertMetric;
  readonly comparison: AlertComparison;
  readonly direction: AlertDirection;
  readonly scope: AlertScope;
  readonly threshold: number;
  readonly windowDays: number;
};

export type Opcao<T extends string> = {
  readonly value: T;
  readonly label: string;
};

// A ordem e a de uso, nao a do enum: custo primeiro (o que mais dispara alerta),
// depois retorno, depois os sinais de entrega.
export const ALERT_METRIC_OPTIONS: readonly Opcao<AlertMetric>[] = (
  ["CPA", "ROAS", "SPEND", "CTR", "CPM", "FREQUENCY"] as const satisfies readonly (keyof typeof ALERT_METRICS)[]
).map((metric) => ({ value: metric, label: alertMetricDefinition(metric).label }));

export const ALERT_COMPARISON_OPTIONS: readonly Opcao<AlertComparison>[] = [
  { value: AlertComparison.PCT_CHANGE, label: "Variação contra a janela anterior" },
  { value: AlertComparison.ABSOLUTE_THRESHOLD, label: "Valor absoluto no período" },
];

export const ALERT_SCOPE_OPTIONS: readonly Opcao<AlertScope>[] = [
  { value: AlertScope.ACCOUNT, label: "A conta inteira" },
  { value: AlertScope.CAMPAIGN, label: "Cada campanha em separado" },
];

// Janelas curtas o bastante para pegar o problema cedo e longas o bastante para
// o piso de volume das metricas de razao ser alcancavel. Um dia so nao entra: a
// oscilacao diaria de uma conta pequena dispararia todo dia.
export const ALERT_WINDOW_OPTIONS: readonly number[] = [3, 7, 14, 30];

// "Acima" e "subindo" sao a mesma direcao lida de dois jeitos: em valor absoluto
// o limiar e um patamar, em variacao ele e o tamanho de um movimento. Rotular os
// dois de "Acima" faria "ROAS acima de 20%" parecer regra de ROAS alto quando e
// regra de ROAS que subiu.
export function directionLabel(comparison: AlertComparison, direction: AlertDirection): string {
  if (comparison === AlertComparison.PCT_CHANGE) {
    return direction === AlertDirection.ABOVE ? "Subiu mais que" : "Caiu mais que";
  }

  return direction === AlertDirection.ABOVE ? "Acima de" : "Abaixo de";
}

export function alertDirectionOptions(
  comparison: AlertComparison,
): readonly Opcao<AlertDirection>[] {
  return [AlertDirection.ABOVE, AlertDirection.BELOW].map((direction) => ({
    value: direction,
    label: directionLabel(comparison, direction),
  }));
}

function escopo(scope: AlertScope): string {
  return scope === AlertScope.ACCOUNT ? "da conta" : "de qualquer campanha";
}

function condicao(rule: RuleShape, currency: string): string {
  const valor = formatThresholdValue(rule.metric, rule.comparison, rule.threshold, currency);

  if (rule.comparison === AlertComparison.PCT_CHANGE) {
    return rule.direction === AlertDirection.ABOVE
      ? `subindo mais de ${valor}`
      : `caindo mais de ${valor}`;
  }

  return rule.direction === AlertDirection.ABOVE ? `acima de ${valor}` : `abaixo de ${valor}`;
}

function janela(rule: RuleShape): string {
  return rule.comparison === AlertComparison.PCT_CHANGE
    ? `em ${rule.windowDays} dias contra os ${rule.windowDays} anteriores`
    : `na janela de ${rule.windowDays} dias`;
}

// A regra inteira numa linha, do jeito que um gestor de trafego diria: "CPA de
// qualquer campanha subindo mais de 30,00% em 7 dias contra os 7 anteriores".
export function ruleSentence(rule: RuleShape, currency: string): string {
  const { label } = alertMetricDefinition(rule.metric);
  return `${label} ${escopo(rule.scope)} ${condicao(rule, currency)}, ${janela(rule)}`;
}

import { AlertComparison, AlertDirection, AlertScope } from "@/generated/prisma/enums";
import { formatMetricInline, formatPercent } from "@/lib/format";
import type { AlertContext } from "./rules";
import { alertMetricDefinition } from "./metrics";
import { formatThresholdValue } from "./threshold";

// O titulo do alerta escrito como um gestor de trafego escreveria, a partir dos
// numeros que o motor guardou no disparo. Mora aqui, e nao no componente, por
// dois motivos: e texto derivado de dado (portanto testavel sem montar arvore de
// React) e a mesma frase serve o cartao, o aria-label do grafico e, um dia, o
// corpo de um e-mail.

// "nos ultimos 7 dias" e a janela da regra, nao o periodo escolhido na topbar: o
// alerta foi medido na janela dele e continua valendo aquilo depois de aberto.
function janela(windowDays: number): string {
  return windowDays === 1 ? "no último dia" : `nos últimos ${windowDays} dias`;
}

// Quem variou/esta fora da faixa. Escopo de campanha sem alvo nao deveria
// existir (o motor so abre alerta de campanha com o alvo em maos), mas o titulo
// nao e lugar de descobrir isso: cai no sujeito da conta, que e o menos errado.
function sujeito(context: AlertContext): string {
  const { label } = alertMetricDefinition(context.metric);

  if (context.scope === AlertScope.CAMPAIGN && context.campaign !== null) {
    return `${label} da campanha ${context.campaign.campaignName}`;
  }

  return `${label} da conta`;
}

// Movimento grande nao precisa de casa decimal ("subiu 62%"), movimento pequeno
// precisa ("subiu 3,4%") -- sem isso um disparo de 1,4% viraria "subiu 1%", que
// e um numero diferente do que fez a regra disparar.
function variacao(deltaPercent: number): string {
  const magnitude = Math.abs(deltaPercent);
  return formatPercent(magnitude, magnitude >= 10 ? 0 : 1);
}

function valor(context: AlertContext, medida: number, currency: string): string {
  return formatMetricInline(medida, alertMetricDefinition(context.metric).unit, currency);
}

function tituloDeVariacao(context: AlertContext, currency: string): string {
  const { deltaPercent, current, previous } = context;
  const inicio = `${sujeito(context)} ${context.direction === AlertDirection.ABOVE ? "subiu" : "caiu"}`;

  // deltaPercent nulo em regra de variacao so acontece com base zero, que o
  // motor recusa antes de abrir o alerta. Se chegar assim, a frase perde o
  // percentual em vez de escrever "NaN%".
  const movimento = deltaPercent === null ? "" : ` ${variacao(deltaPercent)}`;

  if (current.value === null || previous.value === null) {
    return `${inicio}${movimento} ${janela(context.windowDays)}`;
  }

  return (
    `${inicio}${movimento} ${janela(context.windowDays)}, ` +
    `de ${valor(context, previous.value, currency)} para ${valor(context, current.value, currency)}`
  );
}

function tituloDeLimite(context: AlertContext, currency: string): string {
  const limite = formatThresholdValue(context.metric, context.comparison, context.threshold, currency);
  const lado = context.direction === AlertDirection.ABOVE ? "acima" : "abaixo";

  if (context.current.value === null) {
    return `${sujeito(context)} ficou ${lado} do limite de ${limite} ${janela(context.windowDays)}`;
  }

  return (
    `${sujeito(context)} está em ${valor(context, context.current.value, currency)} ` +
    `${janela(context.windowDays)}, ${lado} do limite de ${limite}`
  );
}

// `context` nulo e alerta cujo Json nao passou pela validacao de ./context.ts.
// Nesse caso o nome da regra e a unica coisa verdadeira que sobrou -- melhor
// mostrar isso do que uma frase montada com buraco no meio.
export function alertTitle(
  context: AlertContext | null,
  ruleName: string,
  currency: string,
): string {
  if (context === null) {
    return ruleName;
  }

  return context.comparison === AlertComparison.PCT_CHANGE
    ? tituloDeVariacao(context, currency)
    : tituloDeLimite(context, currency);
}

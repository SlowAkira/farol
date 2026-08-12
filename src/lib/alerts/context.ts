import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import type { MetricTotals } from "@/lib/metrics/calc";
import { isIsoDate } from "@/lib/dates";
import type { AlertContext, AlertTarget, AlertWindowContext } from "./rules";

// Alert.context e uma coluna Json: o Prisma devolve JsonValue, nao AlertContext.
// Quem escreve la e so o motor, com o tipo certo -- mas um `as AlertContext`
// direto faz a pagina confiar num formato que uma migracao futura pode ter
// deixado para tras, e o sintoma seria "undefined" no meio de uma frase em
// portugues. Validar aqui transforma isso num alerta que cai no titulo generico.

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function lerNumero(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function lerEnum<T extends string>(valor: unknown, permitidos: Record<string, T>): T | null {
  return typeof valor === "string" && Object.values<string>(permitidos).includes(valor)
    ? (valor as T)
    : null;
}

const CAMPOS_DE_TOTAIS = [
  "impressions",
  "clicks",
  "spendCents",
  "conversions",
  "conversionValueCents",
  "reach",
] as const satisfies readonly (keyof MetricTotals)[];

function lerTotais(valor: unknown): MetricTotals | null {
  if (!ehObjeto(valor)) {
    return null;
  }

  const totais: Record<string, number> = {};
  for (const campo of CAMPOS_DE_TOTAIS) {
    const numero = lerNumero(valor[campo]);
    if (numero === null) {
      return null;
    }
    totais[campo] = numero;
  }

  return totais as unknown as MetricTotals;
}

function lerJanela(valor: unknown): AlertWindowContext | null {
  if (!ehObjeto(valor) || !ehObjeto(valor.period)) {
    return null;
  }

  const { since, until } = valor.period;
  const totals = lerTotais(valor.totals);

  if (typeof since !== "string" || typeof until !== "string" || totals === null) {
    return null;
  }
  if (!isIsoDate(since) || !isIsoDate(until)) {
    return null;
  }

  // `value` e a metrica da janela e pode ser null de verdade (derivada sem
  // denominador), entao ausencia e null se confundem aqui -- e tudo bem: as duas
  // significam "nao ha numero para mostrar".
  return { period: { since, until }, value: lerNumero(valor.value), totals };
}

function lerCampanha(valor: unknown): AlertTarget | null {
  if (!ehObjeto(valor)) {
    return null;
  }

  const { campaignId, campaignName } = valor;
  return typeof campaignId === "string" && typeof campaignName === "string"
    ? { campaignId, campaignName }
    : null;
}

export function parseAlertContext(valor: unknown): AlertContext | null {
  if (!ehObjeto(valor)) {
    return null;
  }

  const metric = lerEnum(valor.metric, AlertMetric);
  const comparison = lerEnum(valor.comparison, AlertComparison);
  const direction = lerEnum(valor.direction, AlertDirection);
  const scope = lerEnum(valor.scope, AlertScope);
  const threshold = lerNumero(valor.threshold);
  const windowDays = lerNumero(valor.windowDays);
  const current = lerJanela(valor.current);
  const previous = lerJanela(valor.previous);

  if (
    metric === null ||
    comparison === null ||
    direction === null ||
    scope === null ||
    threshold === null ||
    windowDays === null ||
    current === null ||
    previous === null
  ) {
    return null;
  }

  return {
    metric,
    comparison,
    direction,
    scope,
    threshold,
    windowDays,
    // Campanha ausente e legitima: alerta de escopo ACCOUNT nao tem alvo.
    campaign: lerCampanha(valor.campaign),
    current,
    previous,
    deltaPercent: lerNumero(valor.deltaPercent),
  };
}

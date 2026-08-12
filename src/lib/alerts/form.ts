import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import { ALERT_WINDOW_OPTIONS } from "./labels";
import { parseThresholdInput } from "./threshold";

// A fronteira entre o que o formulario manda e o que o banco aceita. Fica aqui,
// puro, e nao dentro da server action, porque validacao de regra de alerta e
// logica de dominio -- e porque a action nao tem como ser testada sem banco.
//
// Tudo chega como string, inclusive o que o <select> ja restringe na tela:
// server action e endpoint publico, e um enum que veio do cliente nao prova nada
// sobre si mesmo.

export type RuleFormValues = {
  readonly name: string;
  readonly metric: string;
  readonly comparison: string;
  readonly direction: string;
  readonly scope: string;
  readonly threshold: string;
  readonly windowDays: string;
};

// O que decide o disparo, sem o nome. Existe separado porque o preview simula a
// condicao, e o nome nao entra em condicao nenhuma: exigir nome para simular
// faria a tela de regra nova abrir sem o preview, que e justamente o que ela tem
// de util antes de a pessoa saber como vai chamar a regra.
export type RuleConditionValues = Omit<RuleFormValues, "name">;

export type RuleFormField = keyof RuleFormValues;

export type RuleFormErrors = Partial<Record<RuleFormField, string>>;

// Mesma forma do AlertRuleInput de src/lib/db/alerts, escrita aqui de novo em
// vez de importada: este modulo e puro e nao deve depender da camada de banco
// para dizer o que e uma regra valida.
export type ParsedCondition = {
  readonly metric: AlertMetric;
  readonly comparison: AlertComparison;
  readonly direction: AlertDirection;
  readonly scope: AlertScope;
  readonly threshold: number;
  readonly windowDays: number;
};

export type ParsedRule = ParsedCondition & { readonly name: string };

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly errors: RuleFormErrors };

// @@unique([userId, name]) nao limita tamanho, mas um nome que nao cabe na
// lista vira reticencia e para de identificar a regra.
const NOME_MAXIMO = 80;

const VALOR_INVALIDO = "Escolha uma das opções da lista.";

function lerEnum<T extends string>(valores: readonly T[], valor: string): T | null {
  return valores.includes(valor as T) ? (valor as T) : null;
}

export function parseRuleCondition(values: RuleConditionValues): ParseResult<ParsedCondition> {
  const errors: RuleFormErrors = {};

  const metric = lerEnum(Object.values(AlertMetric), values.metric);
  const comparison = lerEnum(Object.values(AlertComparison), values.comparison);
  const direction = lerEnum(Object.values(AlertDirection), values.direction);
  const scope = lerEnum(Object.values(AlertScope), values.scope);

  if (metric === null) errors.metric = VALOR_INVALIDO;
  if (comparison === null) errors.comparison = VALOR_INVALIDO;
  if (direction === null) errors.direction = VALOR_INVALIDO;
  if (scope === null) errors.scope = VALOR_INVALIDO;

  const windowDays = Number(values.windowDays);
  if (!ALERT_WINDOW_OPTIONS.includes(windowDays)) {
    errors.windowDays = VALOR_INVALIDO;
  }

  // O limiar so da para ler sabendo metrica, comparacao e direcao -- 250 e
  // R$ 2,50 ou 2,5x conforme as duas primeiras, e "cair 200%" so e impossivel
  // sabendo a terceira. Entao ele espera as tres passarem.
  let threshold: number | null = null;
  if (metric !== null && comparison !== null && direction !== null) {
    const lido = parseThresholdInput(metric, comparison, direction, values.threshold);
    if (lido.ok) {
      threshold = lido.threshold;
    } else {
      errors.threshold = lido.error.message;
    }
  }

  if (
    metric === null ||
    comparison === null ||
    direction === null ||
    scope === null ||
    threshold === null ||
    Object.keys(errors).length > 0
  ) {
    return { ok: false, errors };
  }

  return { ok: true, value: { metric, comparison, direction, scope, threshold, windowDays } };
}

export function parseRuleForm(values: RuleFormValues): ParseResult<ParsedRule> {
  const condicao = parseRuleCondition(values);
  const errors: RuleFormErrors = condicao.ok ? {} : { ...condicao.errors };

  const name = values.name.trim();
  if (name === "") {
    errors.name = "Dê um nome à regra: é ele que identifica o alerta na lista.";
  } else if (name.length > NOME_MAXIMO) {
    errors.name = `O nome cabe em até ${NOME_MAXIMO} caracteres.`;
  }

  if (!condicao.ok || errors.name !== undefined) {
    return { ok: false, errors };
  }

  return { ok: true, value: { name, ...condicao.value } };
}

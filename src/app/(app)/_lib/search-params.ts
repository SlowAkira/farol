import { addDays, isIsoDate, todayIn } from "@/lib/dates";

export const PERIOD_PRESET_DAYS = [7, 14, 30, 90] as const;
export type PeriodPresetDays = (typeof PERIOD_PRESET_DAYS)[number];

const DEFAULT_PRESET_DAYS: PeriodPresetDays = 7;

// Sem conta selecionada ainda nao ha timezone de conta para ancorar o
// periodo padrao; UTC e a referencia neutra ate uma conta entrar em cena.
const REFERENCE_TIMEZONE = "UTC";

export type Period = {
  readonly since: string;
  readonly until: string;
};

export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(searchParams: SearchParamsInput, key: string): string | undefined {
  if (searchParams instanceof URLSearchParams) {
    return searchParams.get(key) ?? undefined;
  }
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

// Termina ontem (ultimo dia completo, mesma logica de src/lib/ingestion/sync.ts),
// nao hoje: o dado de hoje ainda esta incompleto.
export function periodForPreset(days: PeriodPresetDays): Period {
  const until = addDays(todayIn(REFERENCE_TIMEZONE), -1);
  const since = addDays(until, -(days - 1));
  return { since, until };
}

// since/until vem da URL, editavel por qualquer um: entrada invalida ou
// invertida cai no preset padrao em vez de lancar erro.
export function resolvePeriod(searchParams: SearchParamsInput): Period {
  const since = readParam(searchParams, "since");
  const until = readParam(searchParams, "until");

  if (since && until && isIsoDate(since) && isIsoDate(until) && since <= until) {
    return { since, until };
  }

  return periodForPreset(DEFAULT_PRESET_DAYS);
}

// So precisa do id, e o tipo diz isso: assim o seletor (que e client) resolve a
// conta a partir do seu proprio view model, sem importar src/lib/db e arrastar o
// Prisma para o bundle do navegador.
export function resolveAccountId(
  searchParams: SearchParamsInput,
  accounts: readonly { readonly id: string }[],
): string | null {
  const requested = readParam(searchParams, "account");
  if (requested && accounts.some((account) => account.id === requested)) {
    return requested;
  }
  return accounts[0]?.id ?? null;
}

// Usado pelos leaves client para trocar so uma parte da query string (conta
// ou periodo) preservando o resto.
export function withParams(current: URLSearchParams, patch: Record<string, string>): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(patch)) {
    next.set(key, value);
  }
  return next.toString();
}

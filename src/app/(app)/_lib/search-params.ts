import { addDays, isIsoDate, todayIn } from "@/lib/dates";

export const PERIOD_PRESET_DAYS = [7, 14, 30, 90] as const;
export type PeriodPresetDays = (typeof PERIOD_PRESET_DAYS)[number];

const DEFAULT_PRESET_DAYS: PeriodPresetDays = 7;

// Sem conta selecionada ainda nao ha timezone de conta para ancorar o
// periodo padrao; UTC e a referencia neutra ate uma conta entrar em cena.
const REFERENCE_TIMEZONE = "UTC";

// Onde o periodo padrao termina. O ultimo dia medido da conta, quando existe:
// ancorar em ontem faz o preset de 7 dias pedir 7 dias e receber os 3 que a
// ingestao ja alcancou, e o grafico -- que corta o rabo sem dado -- termina
// parecendo quebrado, quando quem esta atrasada e a ingestao.
//
// Conta recem-conectada ainda nao tem dia medido nenhum, e ai ontem volta a ser
// o fim: e o ultimo dia que ja fechou, a mesma referencia que a ingestao usa.
export function periodAnchor(lastDataDate: string | null): string {
  return lastDataDate ?? addDays(todayIn(REFERENCE_TIMEZONE), -1);
}

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

// A ancora e parametro, e nao lida aqui dentro, porque ela vem do banco: assim a
// mesma funcao serve o servidor (que consulta a conta) e o seletor de periodo no
// cliente (que recebe a data pronta), e os dois nao podem discordar sobre onde o
// preset de N dias termina.
export function periodForPreset(days: PeriodPresetDays, anchor: string): Period {
  return { since: addDays(anchor, -(days - 1)), until: anchor };
}

// since/until vem da URL, editavel por qualquer um: entrada invalida ou
// invertida cai no preset padrao em vez de lancar erro.
export function resolvePeriod(searchParams: SearchParamsInput, anchor: string): Period {
  const since = readParam(searchParams, "since");
  const until = readParam(searchParams, "until");

  if (since && until && isIsoDate(since) && isIsoDate(until) && since <= until) {
    return { since, until };
  }

  return periodForPreset(DEFAULT_PRESET_DAYS, anchor);
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

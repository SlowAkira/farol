import { listSyncableAccounts } from "@/lib/db/accounts";
import { logJson } from "@/lib/log";
import { mapWithConcurrency } from "./pool";
import { syncAccount, type SyncErrorCode, type SyncSummary } from "./sync";

// Tres de cada vez: a plataforma de anuncios limita chamadas por app, e cada
// conta ainda segura uma conexao do pool durante a transacao de escrita. Subir
// isso troca minutos de execucao por erro 429 e por espera no pool.
export const SYNC_CONCURRENCY = 3;

export type SyncTrigger = "cron" | "cli";

export type AccountSyncOutcome =
  | {
      readonly ok: true;
      readonly adAccountId: string;
      readonly durationMs: number;
      readonly summary: SyncSummary;
    }
  | {
      readonly ok: false;
      readonly adAccountId: string;
      readonly durationMs: number;
      readonly error: {
        readonly code: SyncErrorCode | "UNEXPECTED";
        readonly message: string;
      };
    };

export type SyncRunReport = {
  readonly startedAt: string;
  readonly durationMs: number;
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly accounts: readonly AccountSyncOutcome[];
};

export type RunOptions = {
  readonly trigger?: SyncTrigger;
  readonly lookbackDays?: number;
  readonly concurrency?: number;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function attempt(
  adAccountId: string,
  startedAt: number,
  lookbackDays: number | undefined,
): Promise<AccountSyncOutcome> {
  try {
    const result = await syncAccount(adAccountId, { lookbackDays });
    const durationMs = Date.now() - startedAt;

    return result.ok
      ? { ok: true, adAccountId, durationMs, summary: result.summary }
      : {
          ok: false,
          adAccountId,
          durationMs,
          error: { code: result.error.code, message: result.error.message },
        };
  } catch (error) {
    // syncAccount devolve erro de dominio como valor, mas nem todo caminho volta
    // como valor: getPrisma sem DATABASE_URL, o timeout de 15s da transacao e
    // erro nao previsto do getProvider ainda sobem como excecao. Sem este catch
    // uma conta quebrada derrubaria a execucao inteira antes das outras rodarem.
    return {
      ok: false,
      adAccountId,
      durationMs: Date.now() - startedAt,
      error: { code: "UNEXPECTED", message: messageOf(error) },
    };
  }
}

function logOutcome(outcome: AccountSyncOutcome, trigger: SyncTrigger): void {
  const base = {
    trigger,
    adAccountId: outcome.adAccountId,
    durationMs: outcome.durationMs,
  };

  if (!outcome.ok) {
    logJson("sync.account", {
      ...base,
      status: "error",
      code: outcome.error.code,
      message: outcome.error.message,
    });
    return;
  }

  logJson("sync.account", {
    ...base,
    status: "ok",
    campaignsSynced: outcome.summary.campaignsSynced,
    insightsInserted: outcome.summary.insightsInserted,
    insightsUpdated: outcome.summary.insightsUpdated,
    insightsSkipped: outcome.summary.insightsSkipped,
    since: outcome.summary.since,
    until: outcome.summary.until,
  });
}

export async function syncOneAccount(
  adAccountId: string,
  options: RunOptions = {},
): Promise<AccountSyncOutcome> {
  const outcome = await attempt(adAccountId, Date.now(), options.lookbackDays);
  logOutcome(outcome, options.trigger ?? "cli");

  return outcome;
}

export async function syncAllAccounts(options: RunOptions = {}): Promise<SyncRunReport> {
  const trigger = options.trigger ?? "cron";
  const startedAt = Date.now();
  const accounts = await listSyncableAccounts();

  const outcomes = await mapWithConcurrency(
    accounts,
    options.concurrency ?? SYNC_CONCURRENCY,
    (account) => syncOneAccount(account.id, { ...options, trigger }),
  );

  const succeeded = outcomes.filter((outcome) => outcome.ok).length;
  const durationMs = Date.now() - startedAt;

  logJson("sync.run", {
    trigger,
    status: outcomes.length === succeeded ? "ok" : "partial",
    total: outcomes.length,
    succeeded,
    failed: outcomes.length - succeeded,
    durationMs,
  });

  return {
    startedAt: new Date(startedAt).toISOString(),
    durationMs,
    total: outcomes.length,
    succeeded,
    failed: outcomes.length - succeeded,
    accounts: outcomes,
  };
}

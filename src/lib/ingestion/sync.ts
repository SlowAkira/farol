import { AccountStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/client";
import { addDays, todayIn } from "@/lib/dates";
import {
  getProvider,
  ProviderConfigError,
  type AdsProvider,
  type ProviderCampaign,
  type ProviderInsight,
} from "@/lib/providers";
import { withRetry } from "./retry";

// Plataforma de anuncios reescreve metrica ja entregue: a janela de atribuicao
// continua creditando conversao ao dia do clique por cerca de 28 dias depois dele.
// Um insight coletado ontem nao e final, entao a cada execucao o periodo recente
// inteiro e reingerido e sobrescrito. Encurtar isso congela numero errado no
// painel; alongar so custa linhas reescritas a toa.
export const DEFAULT_LOOKBACK_DAYS = 28;

export type SyncSummary = {
  readonly campaignsSynced: number;
  readonly insightsInserted: number;
  readonly insightsUpdated: number;
  readonly insightsSkipped: number;
  readonly since: string;
  readonly until: string;
  readonly durationMs: number;
};

export type SyncErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_DISCONNECTED"
  | "INVALID_LOOKBACK"
  | "PROVIDER_CONFIG"
  | "PROVIDER_UNAVAILABLE";

export type SyncError = {
  readonly code: SyncErrorCode;
  readonly message: string;
  readonly adAccountId: string;
};

export type SyncResult =
  | { readonly ok: true; readonly summary: SyncSummary }
  | { readonly ok: false; readonly error: SyncError };

export type SyncOptions = {
  readonly lookbackDays?: number;
};

function failure(adAccountId: string, code: SyncErrorCode, message: string): SyncResult {
  return { ok: false, error: { code, message, adAccountId } };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type Window = { readonly since: string; readonly until: string };

// Ate ontem, nunca ate hoje: o dia corrente ainda esta sendo medido e entraria no
// banco pela metade, aparecendo como queda de spend no ultimo ponto do grafico.
function windowFor(timezone: string, lookbackDays: number): Window {
  const today = todayIn(timezone);
  return { since: addDays(today, -lookbackDays), until: addDays(today, -1) };
}

type ProviderData = {
  readonly campaigns: readonly ProviderCampaign[];
  readonly insights: readonly ProviderInsight[];
};

// Todo I/O de plataforma acontece aqui, antes de qualquer escrita. Buscar dentro
// da transacao seguraria locks de escrita pela duracao de uma chamada HTTP com
// retry, que pode passar de um segundo.
async function fetchFromProvider(
  provider: AdsProvider,
  accountExternalId: string,
  { since, until }: Window,
): Promise<ProviderData> {
  const campaigns = await withRetry(() => provider.listCampaigns(accountExternalId));
  const insights = await withRetry(() =>
    provider.fetchInsights({ accountExternalId, since, until }),
  );

  return { campaigns, insights };
}

async function upsertCampaigns(
  tx: Prisma.TransactionClient,
  adAccountId: string,
  campaigns: readonly ProviderCampaign[],
): Promise<Map<string, string>> {
  const idByExternalId = new Map<string, string>();

  for (const campaign of campaigns) {
    const row = await tx.campaign.upsert({
      where: {
        adAccountId_externalId: { adAccountId, externalId: campaign.externalId },
      },
      create: {
        adAccountId,
        externalId: campaign.externalId,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        dailyBudgetCents: campaign.dailyBudgetCents,
      },
      update: {
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        dailyBudgetCents: campaign.dailyBudgetCents,
      },
      select: { id: true },
    });

    idByExternalId.set(campaign.externalId, row.id);
  }

  return idByExternalId;
}

type InsightRow = {
  readonly campaignId: string;
  readonly date: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly spendCents: number;
  readonly conversions: number;
  readonly conversionValueCents: number;
  readonly reach: number;
};

// Um UPDATE por linha, e nao um unico comando com unnest: SQL cru nao passa pela
// qualificacao de schema do Prisma e so acharia a tabela pelo search_path da
// sessao, o que quebraria o isolamento por schema dos testes. A janela padrao
// reescreve 28 dias x N campanhas, entao sao dezenas de round-trips dentro de uma
// transacao ja aberta -- barato o bastante para nao valer o acoplamento.
async function updateExisting(
  tx: Prisma.TransactionClient,
  rows: readonly InsightRow[],
  ingestedAt: Date,
): Promise<void> {
  for (const row of rows) {
    await tx.dailyInsight.update({
      where: { campaignId_date: { campaignId: row.campaignId, date: row.date } },
      data: {
        impressions: row.impressions,
        clicks: row.clicks,
        spendCents: row.spendCents,
        conversions: row.conversions,
        conversionValueCents: row.conversionValueCents,
        reach: row.reach,
        ingestedAt,
      },
    });
  }
}

type WriteCounts = {
  readonly inserted: number;
  readonly updated: number;
};

// Chave composta das linhas ja existentes. O separador precisa ser um caractere
// que nao aparece nem em cuid nem em YYYY-MM-DD, senao dois pares diferentes
// colidiriam na mesma entrada do Set e a linha sumiria da contagem.
function insightKey(campaignId: string, date: string): string {
  return `${campaignId}|${date}`;
}

async function writeInsights(
  tx: Prisma.TransactionClient,
  rows: readonly InsightRow[],
): Promise<WriteCounts> {
  if (rows.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  // O upsert do Prisma nao informa se gravou linha nova ou sobrescreveu, e o
  // resumo precisa dessa diferenca. Ler as chaves antes resolve com uma consulta
  // so, e dentro da transacao o retrato nao envelhece.
  //
  // O filtro sai das linhas recebidas, nao da janela pedida: provedor que
  // devolvesse um dia fora do intervalo passaria despercebido pela leitura e a
  // execucao seguinte tentaria inserir a mesma chave de novo.
  const existing = await tx.dailyInsight.findMany({
    where: {
      campaignId: { in: [...new Set(rows.map((row) => row.campaignId))] },
      date: { in: [...new Set(rows.map((row) => row.date))] },
    },
    select: { campaignId: true, date: true },
  });

  const existingKeys = new Set(existing.map((row) => insightKey(row.campaignId, row.date)));
  const toInsert = rows.filter((row) => !existingKeys.has(insightKey(row.campaignId, row.date)));
  const toUpdate = rows.filter((row) => existingKeys.has(insightKey(row.campaignId, row.date)));

  if (toInsert.length > 0) {
    await tx.dailyInsight.createMany({ data: [...toInsert] });
  }
  await updateExisting(tx, toUpdate, new Date());

  return { inserted: toInsert.length, updated: toUpdate.length };
}

export async function syncAccount(
  adAccountId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const startedAt = Date.now();
  const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;

  if (!Number.isInteger(lookbackDays) || lookbackDays < 1) {
    return failure(
      adAccountId,
      "INVALID_LOOKBACK",
      `lookbackDays deve ser inteiro maior que zero, recebido: ${lookbackDays}.`,
    );
  }

  const prisma = getPrisma();
  const account = await prisma.adAccount.findUnique({ where: { id: adAccountId } });

  if (account === null) {
    return failure(adAccountId, "ACCOUNT_NOT_FOUND", `Conta ${adAccountId} nao existe.`);
  }

  // Conta desconectada perdeu o token: chamar a plataforma so devolveria 190 e
  // gastaria cota. PAUSED continua sincronizando, porque campanha pausada ainda
  // tem historico que o painel precisa mostrar.
  if (account.status === AccountStatus.DISCONNECTED) {
    return failure(
      adAccountId,
      "ACCOUNT_DISCONNECTED",
      `Conta ${adAccountId} esta desconectada; reconecte antes de sincronizar.`,
    );
  }

  let provider: AdsProvider;
  try {
    provider = getProvider(account.platform);
  } catch (error) {
    if (error instanceof ProviderConfigError) {
      return failure(adAccountId, "PROVIDER_CONFIG", error.message);
    }
    throw error;
  }

  const window = windowFor(account.timezone, lookbackDays);

  let data: ProviderData;
  try {
    data = await fetchFromProvider(provider, account.externalId, window);
  } catch (error) {
    return failure(adAccountId, "PROVIDER_UNAVAILABLE", messageOf(error));
  }

  const counts = await prisma.$transaction(
    async (tx) => {
      const idByExternalId = await upsertCampaigns(tx, adAccountId, data.campaigns);

      const rows: InsightRow[] = [];
      for (const insight of data.insights) {
        const campaignId = idByExternalId.get(insight.campaignExternalId);
        // Insight de campanha que nao veio no listCampaigns (arquivada, por
        // exemplo) nao tem onde ancorar. Some do resumo em vez de sumir calado.
        if (campaignId === undefined) {
          continue;
        }

        rows.push({
          campaignId,
          date: insight.date,
          impressions: insight.impressions,
          clicks: insight.clicks,
          spendCents: insight.spendCents,
          conversions: insight.conversions,
          conversionValueCents: insight.conversionValueCents,
          reach: insight.reach,
        });
      }

      const written = await writeInsights(tx, rows);

      return {
        campaignsSynced: idByExternalId.size,
        skipped: data.insights.length - rows.length,
        ...written,
      };
    },
    // maxWait explicito, e nao o padrao de 2s do Prisma: com o cron sincronizando
    // tres contas ao mesmo tempo, quem chega e encontra o pool ocupado desiste
    // antes de conseguir vaga e a conta falha por espera, nao por erro de
    // ingestao. O `timeout` continua limitando a execucao da transacao; o
    // maxWait limita so a espera para comeca-la.
    { timeout: 15_000, maxWait: 15_000 },
  );

  return {
    ok: true,
    summary: {
      campaignsSynced: counts.campaignsSynced,
      insightsInserted: counts.inserted,
      insightsUpdated: counts.updated,
      insightsSkipped: counts.skipped,
      since: window.since,
      until: window.until,
      durationMs: Date.now() - startedAt,
    },
  };
}

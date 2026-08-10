import { CampaignStatus, type CampaignObjective } from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";
import { computeMetrics, type Metrics, type MetricTotals } from "@/lib/metrics/calc";
import { getPrisma } from "./client";

export type CampaignDetail = {
  readonly id: string;
  readonly externalId: string;
  readonly name: string;
  readonly objective: CampaignObjective;
  readonly status: CampaignStatus;
  readonly dailyBudgetCents: number | null;
  readonly account: {
    readonly id: string;
    readonly name: string;
    readonly currency: string;
  };
  readonly totals: MetricTotals;
  readonly metrics: Metrics;
};

export type CampaignRoster = {
  readonly total: number;
  readonly ativas: number;
  readonly pausadas: number;
};

// Distingue os tres vazios que a tabela de campanhas sozinha nao consegue
// separar: conta que nunca teve campanha, conta cujas campanhas estao todas
// pausadas, e conta que so nao teve gasto neste periodo. Sem isto os tres viram
// a mesma frase generica, e so o primeiro tem alguma acao possivel.
export async function getCampaignRoster(adAccountId: string): Promise<CampaignRoster> {
  const grouped = await getPrisma().campaign.groupBy({
    by: ["status"],
    where: { adAccountId },
    _count: { _all: true },
  });

  const porStatus = new Map(grouped.map((linha) => [linha.status, linha._count._all]));
  const total = grouped.reduce((soma, linha) => soma + linha._count._all, 0);

  return {
    total,
    ativas: porStatus.get(CampaignStatus.ACTIVE) ?? 0,
    pausadas: porStatus.get(CampaignStatus.PAUSED) ?? 0,
  };
}

export async function getCampaignDetail(
  campaignId: string,
  since: string,
  until: string,
): Promise<CampaignDetail | null> {
  if (!isIsoDate(since) || !isIsoDate(until)) {
    throw new RangeError(`Periodo invalido: "${since}" a "${until}". Use o formato YYYY-MM-DD.`);
  }

  const campaign = await getPrisma().campaign.findUnique({
    where: { id: campaignId },
    select: {
      id: true,
      externalId: true,
      name: true,
      objective: true,
      status: true,
      dailyBudgetCents: true,
      adAccount: { select: { id: true, name: true, currency: true } },
    },
  });

  // Campanha inexistente e URL digitada errada, nao falha do sistema: quem chama
  // transforma isso em 404, entao e retorno, nao excecao (CLAUDE.md).
  if (!campaign) {
    return null;
  }

  const { _sum } = await getPrisma().dailyInsight.aggregate({
    where: { campaignId, date: { gte: since, lte: until } },
    _sum: {
      impressions: true,
      clicks: true,
      spendCents: true,
      conversions: true,
      conversionValueCents: true,
      reach: true,
    },
  });

  const totals: MetricTotals = {
    impressions: _sum.impressions ?? 0,
    clicks: _sum.clicks ?? 0,
    spendCents: _sum.spendCents ?? 0,
    conversions: _sum.conversions ?? 0,
    conversionValueCents: _sum.conversionValueCents ?? 0,
    reach: _sum.reach ?? 0,
  };

  return {
    id: campaign.id,
    externalId: campaign.externalId,
    name: campaign.name,
    objective: campaign.objective,
    status: campaign.status,
    dailyBudgetCents: campaign.dailyBudgetCents,
    account: campaign.adAccount,
    totals,
    metrics: computeMetrics(totals),
  };
}

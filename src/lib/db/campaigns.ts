import type { CampaignObjective, CampaignStatus } from "@/generated/prisma/enums";
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

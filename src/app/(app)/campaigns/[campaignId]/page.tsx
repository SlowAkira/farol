import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCampaignDetail } from "@/lib/db/campaigns";
import { formatMetric } from "@/lib/format";
import { metricValues } from "@/lib/metrics/calc";
import { DASHBOARD_METRICS } from "@/lib/metrics/catalog";
import { resolvePeriod, type SearchParamsInput } from "../../_lib/search-params";

const OBJECTIVE_LABEL = {
  CONVERSIONS: "Conversões",
  TRAFFIC: "Tráfego",
  AWARENESS: "Reconhecimento",
  LEADS: "Leads",
} as const;

const STATUS_LABEL = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Arquivada",
  DELETED: "Excluída",
} as const;

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { campaignId } = await params;
  const period = resolvePeriod(await searchParams);

  const campaign = await getCampaignDetail(campaignId, period.since, period.until);
  if (!campaign) {
    notFound();
  }

  const values = metricValues(campaign.totals);
  const budget =
    campaign.dailyBudgetCents === null
      ? null
      : formatMetric(campaign.dailyBudgetCents, "currency", campaign.account.currency);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Link
          href={`/dashboard?since=${period.since}&until=${period.until}`}
          className="text-sm text-brand-link underline-offset-4 hover:underline"
        >
          ← Voltar ao dashboard
        </Link>
        <h1 className="text-2xl font-semibold">{campaign.name}</h1>
        <p className="text-muted-foreground">
          {campaign.account.name} · {OBJECTIVE_LABEL[campaign.objective]} ·{" "}
          {STATUS_LABEL[campaign.status]} · {period.since} a {period.until}
          {budget ? <> · Orçamento diário {budget.display}</> : null}
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
        {DASHBOARD_METRICS.map((definition) => {
          const formatted = formatMetric(
            values[definition.key],
            definition.unit,
            campaign.account.currency,
          );

          return (
            <Card key={definition.key} className="gap-0 py-6">
              <CardHeader className="px-6">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {definition.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6">
                <p className="text-3xl font-semibold tracking-tight" title={formatted.title}>
                  {formatted.display}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

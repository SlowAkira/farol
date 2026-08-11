import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricValue } from "@/components/metric-value";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OBJECTIVE_LABEL, STATUS_LABEL } from "@/lib/campaigns/labels";
import { getCampaignDetail } from "@/lib/db/campaigns";
import { getCampaignLastDataDate } from "@/lib/db/insights";
import { formatMetric, formatPeriod } from "@/lib/format";
import { metricUnavailability } from "@/lib/metrics/availability";
import { metricValues } from "@/lib/metrics/calc";
import { DASHBOARD_METRICS } from "@/lib/metrics/catalog";
import { periodAnchor, resolvePeriod, type SearchParamsInput } from "../../_lib/search-params";

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const { campaignId } = await params;
  // Ancora no ultimo dia da propria campanha, e nao no da conta: campanha
  // encerrada meses atras abriria num periodo em que ela ja nao rodava, e a
  // pagina inteira sairia em travessao.
  const period = resolvePeriod(
    await searchParams,
    periodAnchor(await getCampaignLastDataDate(campaignId)),
  );

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
          className="transition-interactive text-body text-brand-link underline-offset-4 hover:underline"
        >
          ← Voltar ao dashboard
        </Link>
        <h1 className="text-section font-semibold">{campaign.name}</h1>
        <p className="text-muted-foreground">
          {campaign.account.name} · {OBJECTIVE_LABEL[campaign.objective]} ·{" "}
          {STATUS_LABEL[campaign.status]} · {formatPeriod(period.since, period.until)}
          {budget ? <> · Orçamento diário {budget.display}</> : null}
        </p>
      </header>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
        {DASHBOARD_METRICS.map((definition) => {
          const formatted = formatMetric(
            values[definition.key],
            definition.unit,
            campaign.account.currency,
            metricUnavailability(definition.key, campaign.totals),
          );

          return (
            <Card key={definition.key} className="gap-0 py-6">
              <CardHeader className="px-6">
                <CardTitle className="text-body font-medium text-muted-foreground">
                  {definition.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-6">
                <MetricValue
                  value={values[definition.key]}
                  unit={definition.unit}
                  currency={campaign.account.currency}
                  display={formatted.display}
                  title={formatted.title}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

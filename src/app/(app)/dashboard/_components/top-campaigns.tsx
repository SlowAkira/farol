import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCampaignBreakdown } from "@/lib/db/insights";
import { formatMetric } from "@/lib/format";
import { metricDefinition, type DashboardMetricKey } from "@/lib/metrics/catalog";
import { metricValues } from "@/lib/metrics/calc";

const TOP_COUNT = 5;

const COLUMNS = ["spendCents", "roasRatio", "cpaCents", "conversions"] as const satisfies
  readonly DashboardMetricKey[];

export async function TopCampaigns({
  accountId,
  currency,
  period,
}: {
  accountId: string;
  currency: string;
  period: { since: string; until: string };
}) {
  // getCampaignBreakdown ja devolve ordenado por gasto decrescente.
  const campaigns = (await getCampaignBreakdown(accountId, period.since, period.until)).slice(
    0,
    TOP_COUNT,
  );

  const detailQuery = new URLSearchParams({ since: period.since, until: period.until }).toString();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campanhas com maior gasto</CardTitle>
        <CardDescription>
          As {TOP_COUNT} que mais consumiram verba no período selecionado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <p className="text-muted-foreground">Nenhuma campanha teve gasto no período.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                {COLUMNS.map((key) => (
                  <TableHead key={key} className="text-right">
                    {metricDefinition(key).label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((campaign) => {
                const values = metricValues(campaign.totals);

                return (
                  <TableRow key={campaign.campaignId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/campaigns/${campaign.campaignId}?${detailQuery}`}
                        className="text-brand-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {campaign.name}
                      </Link>
                    </TableCell>
                    {COLUMNS.map((key) => {
                      const formatted = formatMetric(
                        values[key],
                        metricDefinition(key).unit,
                        currency,
                      );

                      return (
                        <TableCell
                          key={key}
                          className="text-right tabular-nums"
                          title={formatted.title}
                        >
                          {formatted.display}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

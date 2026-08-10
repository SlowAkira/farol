import { CalendarOff, CirclePause } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CampaignRoster } from "@/lib/db/campaigns";
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
  roster,
}: {
  accountId: string;
  currency: string;
  period: { since: string; until: string };
  roster: CampaignRoster;
}) {
  // getCampaignBreakdown ja devolve ordenado por gasto decrescente.
  const campaigns = (await getCampaignBreakdown(accountId, period.since, period.until)).slice(
    0,
    TOP_COUNT,
  );

  const detailQuery = new URLSearchParams({ since: period.since, until: period.until }).toString();
  const todasPausadas = roster.ativas === 0 && roster.pausadas > 0;

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
          // Nenhum gasto no periodo tem duas causas bem diferentes, e so uma
          // delas e acionavel: campanha pausada e uma decisao que alguem tomou,
          // periodo vazio e so um recorte sem movimento.
          todasPausadas ? (
            <EmptyState
              icon={CirclePause}
              titulo="Todas as campanhas estão pausadas"
              descricao="Nenhuma campanha desta conta está em veiculação, então não houve gasto no período. O histórico anterior continua disponível: escolha um período em que elas ainda rodavam."
            />
          ) : (
            <EmptyState
              icon={CalendarOff}
              titulo="Nenhum gasto neste período"
              descricao={`As campanhas desta conta não registraram gasto entre ${period.since} e ${period.until}. Um período mais longo costuma alcançar a última veiculação.`}
            />
          )
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
                    {/* Nome quebra linha (o resto da tabela nao): em 375px uma
                        celula de nome inteira numa linha so empurraria as quatro
                        colunas de numero para fora da tela. */}
                    <TableCell className="min-w-40 font-medium whitespace-normal">
                      <Link
                        href={`/campaigns/${campaign.campaignId}?${detailQuery}`}
                        className="text-brand-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {campaign.name}
                      </Link>
                      {campaign.status === "PAUSED" ? (
                        // Borda em vez de fundo preenchido: `bg-muted` com
                        // `text-muted-foreground` da 4,3:1 no tema claro, abaixo
                        // de AA. Sobre o cartao o mesmo texto da 4,7:1.
                        <span className="ml-2 rounded-full border border-border px-2 py-0.5 align-middle text-xs whitespace-nowrap text-muted-foreground">
                          Pausada
                        </span>
                      ) : null}
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

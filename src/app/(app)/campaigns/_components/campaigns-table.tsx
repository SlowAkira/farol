import { ArrowDown, ArrowUp, CalendarOff, ChevronsUpDown, Inbox } from "lucide-react";
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
import { OBJECTIVE_LABEL, STATUS_LABEL } from "@/lib/campaigns/labels";
import {
  sortCampaigns,
  toggleSort,
  type CampaignSort,
  type SortColumn,
} from "@/lib/campaigns/sort";
import { getCampaignTable } from "@/lib/db/insights";
import { formatDay, formatMetric } from "@/lib/format";
import { metricUnavailability, SEM_INGESTAO } from "@/lib/metrics/availability";
import { metricValues } from "@/lib/metrics/calc";
import { CAMPAIGN_TABLE_METRICS } from "@/lib/metrics/catalog";
import { cn } from "@/lib/utils";

type Period = { readonly since: string; readonly until: string };

// A celula do nome fica presa na rolagem horizontal: com onze colunas em 375px o
// nome sai da tela antes da metade da linha, e sem ele os numeros nao dizem de
// quem sao. `bg-card` porque a celula precisa cobrir o que passa por baixo, e
// `group-hover` para nao ser a unica celula que ignora o realce da linha.
const NAME_CELL = "sticky left-0 z-10 bg-card group-hover:bg-muted/50";

function sortHref(params: URLSearchParams, sort: CampaignSort): string {
  const next = new URLSearchParams(params);
  next.set("sort", sort.column);
  next.set("dir", sort.direction);
  return `?${next.toString()}`;
}

function SortableHead({
  label,
  column,
  sort,
  params,
  className,
}: {
  label: string;
  column: SortColumn;
  sort: CampaignSort;
  params: URLSearchParams;
  className?: string;
}) {
  const ativa = sort.column === column;
  const proxima = toggleSort(sort, column);
  const Icon = !ativa ? ChevronsUpDown : sort.direction === "asc" ? ArrowUp : ArrowDown;

  return (
    // aria-sort e o que anuncia a ordenacao a leitor de tela; a seta e o que
    // anuncia a quem enxerga. Nenhum dos dois e cor.
    <TableHead
      aria-sort={ativa ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={className}
    >
      <Link
        href={sortHref(params, proxima)}
        aria-label={`Ordenar por ${label}, ${proxima.direction === "asc" ? "crescente" : "decrescente"}`}
        className={cn(
          "transition-interactive inline-flex items-center gap-1 rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          ativa ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      </Link>
    </TableHead>
  );
}

export async function CampaignsTable({
  accountId,
  currency,
  period,
  sort,
  params,
}: {
  accountId: string;
  currency: string;
  period: Period;
  sort: CampaignSort;
  params: URLSearchParams;
}) {
  const campaigns = await getCampaignTable(accountId, period.since, period.until);

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={Inbox}
            titulo="Nenhuma campanha nesta conta"
            descricao="A conta está conectada, mas ainda não há campanha registrada. Assim que a primeira campanha rodar, ela aparece aqui na próxima sincronização."
          />
        </CardContent>
      </Card>
    );
  }

  // Nenhuma campanha medida no periodo e diferente de conta sem campanha, e as
  // duas seriam a mesma tabela de travessoes. Uma tela de onze colunas vazias
  // nao informa mais que uma frase, e a frase diz o que fazer.
  const medidas = campaigns.filter((campaign) => campaign.hasData).length;
  const contagem =
    campaigns.length === 1 ? "1 campanha" : `${campaigns.length} campanhas`;

  if (medidas === 0) {
    return (
      <Card>
        <CardContent>
          <EmptyState
            icon={CalendarOff}
            titulo="Nenhuma métrica ingerida neste período"
            descricao={`${contagem} desta conta continua${campaigns.length === 1 ? "" : "m"} registrada${campaigns.length === 1 ? "" : "s"}, mas nenhuma tem métrica entre ${formatDay(period.since)} e ${formatDay(period.until)}. Um período mais longo costuma alcançar a última veiculação.`}
          />
        </CardContent>
      </Card>
    );
  }

  const ordenadas = sortCampaigns(campaigns, sort);
  const detailQuery = new URLSearchParams({ since: period.since, until: period.until }).toString();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campanhas da conta</CardTitle>
        <CardDescription>
          {contagem} no período selecionado. Clique num cabeçalho para reordenar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHead
                label="Campanha"
                column="name"
                sort={sort}
                params={params}
                className={NAME_CELL}
              />
              <SortableHead label="Objetivo" column="objective" sort={sort} params={params} />
              <SortableHead label="Status" column="status" sort={sort} params={params} />
              {CAMPAIGN_TABLE_METRICS.map((definition) => (
                <SortableHead
                  key={definition.key}
                  label={definition.label}
                  column={definition.key}
                  sort={sort}
                  params={params}
                  // Seta antes do rotulo na coluna de numero: o rotulo encosta
                  // na direita, alinhado com os numeros da coluna, e o icone nao
                  // entra no meio do alinhamento.
                  className="text-right [&>a]:flex-row-reverse"
                />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenadas.map((campaign) => {
              const values = metricValues(campaign.totals);

              return (
                <TableRow key={campaign.campaignId} className="group">
                  {/* Nome quebra linha (o resto da tabela nao): em 375px uma
                      celula de nome inteira numa linha so empurraria as oito
                      colunas de numero para muito longe na rolagem. */}
                  <TableCell className={cn(NAME_CELL, "min-w-40 font-medium whitespace-normal")}>
                    <Link
                      href={`/campaigns/${campaign.campaignId}?${detailQuery}`}
                      className="transition-interactive text-brand-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {campaign.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {OBJECTIVE_LABEL[campaign.objective]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {STATUS_LABEL[campaign.status]}
                  </TableCell>
                  {CAMPAIGN_TABLE_METRICS.map((definition) => {
                    // Campanha sem ingestao no periodo chega com totais zerados
                    // iguais aos de quem rodou e gastou zero. Escrever "R$ 0" ali
                    // afirmaria uma medicao que nao existe, entao a linha inteira
                    // vira travessao -- inclusive nas colunas de total.
                    const formatted = campaign.hasData
                      ? formatMetric(
                          values[definition.key],
                          definition.unit,
                          currency,
                          metricUnavailability(definition.key, campaign.totals),
                        )
                      : formatMetric(null, definition.unit, currency, SEM_INGESTAO);

                    return (
                      <TableCell
                        key={definition.key}
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
      </CardContent>
    </Card>
  );
}

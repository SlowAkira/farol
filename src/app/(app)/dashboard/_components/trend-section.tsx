import { CalendarOff } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trimToLastDataDay } from "@/lib/charts/series";
import { getDailySeries } from "@/lib/db/insights";
import { formatDayLabel } from "@/lib/format";
import { metricUnavailability } from "@/lib/metrics/availability";
import { metricValues } from "@/lib/metrics/calc";
import { DASHBOARD_METRICS } from "@/lib/metrics/catalog";
import { TrendChart, type TrendRow } from "./trend-chart";

export async function TrendSection({
  accountId,
  currency,
  period,
}: {
  accountId: string;
  currency: string;
  period: { since: string; until: string };
}) {
  const days = await getDailySeries(accountId, period.since, period.until);

  // Corta o rabo de dias ainda nao ingeridos antes de virar ponto no grafico:
  // eles voltam zerados do banco e desenhariam uma queda que nao aconteceu.
  const { days: measured, lastDataDate } = trimToLastDataDay(days);

  // As derivadas de cada dia saem daqui, no servidor, via src/lib/metrics: o
  // componente cliente do grafico so recebe numero pronto e nunca divide. O
  // mesmo vale para o motivo do travessao, que depende dos totais do dia.
  const rows: TrendRow[] = measured.map((day) => {
    const values = metricValues(day);
    const motivos: { [K in (typeof DASHBOARD_METRICS)[number]["key"]]?: string } = {};

    for (const { key } of DASHBOARD_METRICS) {
      const motivo = metricUnavailability(key, day);
      if (motivo !== null) {
        motivos[key] = motivo;
      }
    }

    return {
      date: day.date,
      label: formatDayLabel(day.date),
      spendCents: values.spendCents,
      roasRatio: values.roasRatio,
      cpaCents: values.cpaCents,
      conversions: values.conversions,
      ctrPercent: values.ctrPercent,
      motivos,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evolução no período</CardTitle>
        <CardDescription>
          Duas métricas lado a lado, cada uma na própria escala. Passe o mouse ou use as setas do
          teclado sobre o gráfico para ler os valores de um dia.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lastDataDate === null ? (
          // Nenhum dia medido nao e o mesmo que dias medidos com valor zero: o
          // grafico de zeros desenharia uma reta no chao, que se le como
          // resultado, e nao como ausencia de ingestao.
          <EmptyState
            icon={CalendarOff}
            titulo="Nenhum dia medido neste período"
            descricao={`Ainda não há métrica ingerida entre ${period.since} e ${period.until}. A próxima sincronização preenche os dias que já fecharam.`}
          />
        ) : (
          <TrendChart
            rows={rows}
            currency={currency}
            coverageLabel={`Dados até ${formatDayLabel(lastDataDate)}`}
          />
        )}
      </CardContent>
    </Card>
  );
}

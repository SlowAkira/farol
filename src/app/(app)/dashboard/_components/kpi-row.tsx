import { trimToLastDataDay } from "@/lib/charts/series";
import { addDays } from "@/lib/dates";
import { getAccountTotals, getDailySeries, getPreviousPeriod } from "@/lib/db/insights";
import { metricValues } from "@/lib/metrics/calc";
import { DASHBOARD_METRICS } from "@/lib/metrics/catalog";
import { compareMetrics } from "@/lib/metrics/compare";
import { KpiCard } from "./kpi-card";

// A sparkline tem janela propria: 14 dias terminando no fim do periodo escolhido,
// mesmo quando o periodo e mais curto que isso. Um preset de 7 dias com uma
// sparkline de 7 pontos mostraria a tendencia com a mesma resolucao do numero
// que ela deveria contextualizar.
const TREND_DAYS = 14;

export async function KpiRow({
  accountId,
  currency,
  period,
}: {
  accountId: string;
  currency: string;
  period: { since: string; until: string };
}) {
  const previous = getPreviousPeriod(period.since, period.until);
  const trendSince = addDays(period.until, -(TREND_DAYS - 1));

  const [currentTotals, previousTotals, trendDays] = await Promise.all([
    getAccountTotals(accountId, period.since, period.until),
    getAccountTotals(accountId, previous.since, previous.until),
    getDailySeries(accountId, trendSince, period.until),
  ]);

  const comparison = compareMetrics(currentTotals, previousTotals);
  // Mesmo corte do grafico: dia ainda nao ingerido volta zerado do banco, e um
  // zero no fim da sparkline desenha um tombo que nao aconteceu.
  const trend = trimToLastDataDay(trendDays).days.map((day) => metricValues(day));

  return (
    <section aria-labelledby="kpis-titulo">
      <h2 id="kpis-titulo" className="sr-only">
        Indicadores do período
      </h2>
      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5">
        {DASHBOARD_METRICS.map((definition) => (
          <KpiCard
            key={definition.key}
            definition={definition}
            comparison={comparison[definition.key]}
            trend={trend.map((values) => values[definition.key])}
            currency={currency}
          />
        ))}
      </div>
    </section>
  );
}

import { MetricValue } from "@/components/metric-value";
import { Card, CardContent } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import { metricUnavailability } from "@/lib/metrics/availability";
import type { MetricTotals } from "@/lib/metrics/calc";
import type { MetricDefinition } from "@/lib/metrics/catalog";
import type { MetricComparison } from "@/lib/metrics/compare";
import { DeltaBadge } from "./delta-badge";
import { Sparkline } from "@/components/sparkline";

export function KpiCard({
  definition,
  comparison,
  totals,
  trend,
  currency,
}: {
  definition: MetricDefinition;
  comparison: MetricComparison;
  // Os totais do periodo vem junto do valor ja comparado porque e deles que sai
  // a explicacao do travessao: o numero sozinho diz que nao ha metrica, e nao
  // qual grandeza faltou para ela existir.
  totals: MetricTotals;
  trend: readonly (number | null)[];
  currency: string;
}) {
  const value = formatMetric(
    comparison.current,
    definition.unit,
    currency,
    metricUnavailability(definition.key, totals),
  );

  return (
    <Card className="gap-0 py-6">
      <CardContent className="flex flex-col gap-3 px-6">
        <h3 className="text-body font-medium text-muted-foreground">{definition.label}</h3>

        {/* title carrega o valor exato: a tela mostra "R$ 1,2 mi", o title mostra
            o centavo. */}
        <MetricValue
          value={comparison.current}
          unit={definition.unit}
          currency={currency}
          display={value.display}
          title={value.title}
        />

        <DeltaBadge comparison={comparison} />

        <div className="pt-1">
          <Sparkline
            values={trend}
            label={`${definition.label}: tendência dos últimos 14 dias`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

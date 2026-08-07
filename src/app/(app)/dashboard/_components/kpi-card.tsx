import { Card, CardContent } from "@/components/ui/card";
import { formatMetric } from "@/lib/format";
import type { MetricDefinition } from "@/lib/metrics/catalog";
import type { MetricComparison } from "@/lib/metrics/compare";
import { DeltaBadge } from "./delta-badge";
import { Sparkline } from "./sparkline";

export function KpiCard({
  definition,
  comparison,
  trend,
  currency,
}: {
  definition: MetricDefinition;
  comparison: MetricComparison;
  trend: readonly (number | null)[];
  currency: string;
}) {
  const value = formatMetric(comparison.current, definition.unit, currency);

  return (
    <Card className="gap-0 py-6">
      <CardContent className="flex flex-col gap-3 px-6">
        <h3 className="text-sm font-medium text-muted-foreground">{definition.label}</h3>

        {/* title carrega o valor exato: a tela mostra "R$ 1,2 mi", o title mostra
            o centavo. Numero grande fica em figura proporcional, sem tabular-nums,
            que so serve para coluna que precisa alinhar. */}
        <p className="text-3xl font-semibold tracking-tight" title={value.title}>
          {value.display}
        </p>

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

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { formatDelta } from "@/lib/format";
import { changeTone, type MetricComparison } from "@/lib/metrics/compare";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  positive: "text-state-positive",
  negative: "text-state-negative",
  neutral: "text-muted-foreground",
} as const;

// Seta e sinal, nao so cor: quem nao distingue verde de vermelho le a direcao no
// icone e no "+"/"-" do numero (regra de daltonismo do CLAUDE.md).
export function DeltaBadge({ comparison }: { comparison: MetricComparison }) {
  const tone = changeTone(comparison);
  const delta = formatDelta(comparison.deltaPercent);
  const rose = comparison.deltaAbsolute !== null && comparison.deltaAbsolute > 0;
  const fell = comparison.deltaAbsolute !== null && comparison.deltaAbsolute < 0;

  const Icon = rose ? ArrowUp : fell ? ArrowDown : Minus;

  return (
    <p
      className={cn("flex items-center gap-1 text-body font-medium", TONE_CLASS[tone])}
      title={delta.title}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{delta.display}</span>
      <span className="font-normal text-muted-foreground">vs. período anterior</span>
    </p>
  );
}

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CAMPAIGN_TABLE_METRICS } from "@/lib/metrics/catalog";

// Mesma forma da tabela que vai chegar, e nao um spinner: o cabecalho ja esta na
// tela e so as celulas faltam, entao nada salta de lugar quando o dado chega.
export function CampaignsTableSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {Array.from({ length: 8 }, (_, linha) => (
          <div key={linha} className="flex items-center gap-4">
            <Skeleton className="h-5 min-w-40 flex-1" />
            {CAMPAIGN_TABLE_METRICS.map((definition) => (
              <Skeleton key={definition.key} className="hidden h-5 w-16 md:block" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

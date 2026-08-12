import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Mesma forma do cartao de alerta -- disco do icone, duas linhas de texto e o
// retangulo do mini grafico -- para o feed nao saltar quando o dado chega.
function CartaoFantasma() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Skeleton className="size-9 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-5 w-full max-w-lg" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
        </div>
        <Skeleton className="h-10 w-50" />
      </CardContent>
    </Card>
  );
}

export function AlertFeedSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <div className="flex flex-col gap-3">
          <CartaoFantasma />
          <CartaoFantasma />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-6 w-32" />
        <CartaoFantasma />
      </div>
    </div>
  );
}

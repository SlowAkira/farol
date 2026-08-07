import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Cada bloco tem o esqueleto com a forma e a altura do conteudo que vai chegar,
// nao um spinner: a pagina ja aparece com o layout final e o que falta e so o
// numero, entao nada salta de lugar quando o dado chega.
export function KpiRowSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-5" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} className="gap-0 py-6">
          <CardContent className="flex flex-col gap-3 px-6">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-5 w-36" />
            <Skeleton className="mt-1 h-7 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function TrendSectionSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-4">
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-8 w-44" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[200px] w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-[200px] w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function TopCampaignsSkeleton() {
  return (
    <Card aria-hidden="true">
      <CardHeader className="gap-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-4">
            <Skeleton className="h-5 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

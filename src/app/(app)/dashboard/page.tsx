import { Suspense } from "react";
import { listSyncableAccounts } from "@/lib/db/accounts";
import { resolveAccountId, resolvePeriod, type SearchParamsInput } from "../_lib/search-params";
import { KpiRow } from "./_components/kpi-row";
import {
  KpiRowSkeleton,
  TopCampaignsSkeleton,
  TrendSectionSkeleton,
} from "./_components/skeletons";
import { TopCampaigns } from "./_components/top-campaigns";
import { TrendSection } from "./_components/trend-section";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const params = await searchParams;
  const accounts = await listSyncableAccounts();
  const accountId = resolveAccountId(params, accounts);
  const period = resolvePeriod(params);

  if (!accountId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Nenhuma conta de anúncios conectada ainda.</p>
      </div>
    );
  }

  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    throw new Error(`Conta ${accountId} passou pela resolucao mas sumiu da lista.`);
  }

  const section = { accountId, currency: account.currency, period };

  // Um Suspense por bloco, e nao um em volta da pagina inteira: os KPIs, o
  // grafico e a tabela vem de consultas independentes, entao cada um aparece
  // assim que o seu dado chega. Sem `key` de proposito -- ao trocar de periodo o
  // Next segura o render anterior durante a transicao, e reintroduzir o esqueleto
  // ali seria piscada, nao carregamento.
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground">
          {account.name} · {period.since} a {period.until}
        </p>
      </header>

      <Suspense fallback={<KpiRowSkeleton />}>
        <KpiRow {...section} />
      </Suspense>

      <Suspense fallback={<TrendSectionSkeleton />}>
        <TrendSection {...section} />
      </Suspense>

      <Suspense fallback={<TopCampaignsSkeleton />}>
        <TopCampaigns {...section} />
      </Suspense>
    </div>
  );
}

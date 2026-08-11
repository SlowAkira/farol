import { listDashboardAccounts } from "@/lib/db/accounts";
import { getAccountLastDataDate } from "@/lib/db/insights";
import {
  periodAnchor,
  resolveAccountId,
  resolvePeriod,
  type SearchParamsInput,
} from "../_lib/search-params";

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const params = await searchParams;
  // A mesma lista que a topbar recebe, e nao a de contas sincronizaveis: agora
  // que o periodo padrao sai da conta, resolver a conta de outro jeito aqui faz
  // o seletor de periodo e a pagina ancorarem em datas diferentes.
  const accounts = await listDashboardAccounts();
  const accountId = resolveAccountId(params, accounts);
  const period = resolvePeriod(
    params,
    periodAnchor(accountId === null ? null : await getAccountLastDataDate(accountId)),
  );

  if (!accountId) {
    return (
      <div>
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <p className="mt-2 text-muted-foreground">Nenhuma conta de anúncios conectada ainda.</p>
      </div>
    );
  }

  const account = accounts.find((candidate) => candidate.id === accountId);

  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Campanhas</h1>
      <p className="text-muted-foreground">
        Conta: {account?.name} · Período: {period.since} a {period.until}
      </p>
    </div>
  );
}

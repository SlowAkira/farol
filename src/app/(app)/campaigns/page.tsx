import { listSyncableAccounts } from "@/lib/db/accounts";
import { resolveAccountId, resolvePeriod, type SearchParamsInput } from "../_lib/search-params";

export default async function CampaignsPage({
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
      <div className="p-8">
        <h1 className="text-2xl font-semibold">Campanhas</h1>
        <p className="mt-2 text-muted-foreground">Nenhuma conta de anúncios conectada ainda.</p>
      </div>
    );
  }

  const account = accounts.find((candidate) => candidate.id === accountId);

  return (
    <div className="space-y-2 p-8">
      <h1 className="text-2xl font-semibold">Campanhas</h1>
      <p className="text-muted-foreground">
        Conta: {account?.name} · Período: {period.since} a {period.until}
      </p>
    </div>
  );
}

import { listDashboardAccounts, type DashboardAccount } from "@/lib/db/accounts";
import { resolveAccountId, type SearchParamsInput } from "../../_lib/search-params";

// As quatro rotas de alerta (feed, lista de regras, nova regra, edicao) resolvem
// a conta do mesmo jeito que o dashboard e a topbar: `?account=` quando aponta
// para uma conta que existe, e a primeira da lista quando nao. Resolver isso
// separadamente em cada pagina e o que faz um link perder a conta no caminho.
export async function resolveAlertsAccount(
  params: SearchParamsInput,
): Promise<DashboardAccount | null> {
  const accounts = await listDashboardAccounts();
  const accountId = resolveAccountId(params, accounts);

  return accounts.find((candidate) => candidate.id === accountId) ?? null;
}

// A conta viaja na query string entre as telas de alerta. Sem ela o link para as
// regras abriria as regras da primeira conta, e nao as da que estava na tela.
export function alertsHref(path: string, accountId: string): string {
  return `${path}?account=${encodeURIComponent(accountId)}`;
}

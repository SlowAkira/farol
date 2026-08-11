import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { isDisconnected, type DashboardAccount } from "@/lib/db/accounts";
import { AccountSelector, type AccountOption } from "./account-selector";
import { DateRangePicker } from "./date-range-picker";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

// Os dois controles leem a query string com useSearchParams, e o Next exige que
// isso fique dentro de um Suspense: sem a fronteira o build de producao aborta a
// prerenderizacao de toda pagina do grupo (app) com "useSearchParams() should be
// wrapped in a suspense boundary". O fallback tem a medida do controle para o
// cabecalho nao mudar de altura quando ele entra.
export function Topbar({
  accounts,
  ultimoDiaPorConta,
}: {
  accounts: DashboardAccount[];
  ultimoDiaPorConta: Record<string, string>;
}) {
  // Achata para um view model serializavel antes de cruzar a fronteira de
  // cliente: o seletor precisa saber que a conta esta desconectada, mas nao
  // precisa (nem pode) importar o enum do Prisma para descobrir isso.
  const options: AccountOption[] = accounts.map((account) => ({
    id: account.id,
    name: account.name,
    desconectada: isDisconnected(account),
    ultimoDiaComDado: ultimoDiaPorConta[account.id] ?? null,
  }));

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-6">
      <Suspense fallback={<Skeleton className="h-9 w-48" />}>
        <AccountSelector accounts={options} />
      </Suspense>
      <div className="flex flex-wrap items-center gap-3">
        <Suspense fallback={<Skeleton className="h-8 w-72 max-w-full" />}>
          <DateRangePicker accounts={options} />
        </Suspense>
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}

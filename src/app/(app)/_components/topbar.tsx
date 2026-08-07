import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SyncableAccount } from "@/lib/db/accounts";
import { AccountSelector } from "./account-selector";
import { DateRangePicker } from "./date-range-picker";
import { ThemeToggle } from "./theme-toggle";

// Os dois controles leem a query string com useSearchParams, e o Next exige que
// isso fique dentro de um Suspense: sem a fronteira o build de producao aborta a
// prerenderizacao de toda pagina do grupo (app) com "useSearchParams() should be
// wrapped in a suspense boundary". O fallback tem a medida do controle para o
// cabecalho nao mudar de altura quando ele entra.
export function Topbar({ accounts }: { accounts: SyncableAccount[] }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
      <Suspense fallback={<Skeleton className="h-9 w-48" />}>
        <AccountSelector accounts={accounts} />
      </Suspense>
      <div className="flex items-center gap-3">
        <Suspense fallback={<Skeleton className="h-8 w-72" />}>
          <DateRangePicker />
        </Suspense>
        <ThemeToggle />
      </div>
    </header>
  );
}

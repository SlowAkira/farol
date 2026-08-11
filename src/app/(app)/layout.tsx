import type { ReactNode } from "react";
import { auth } from "@/auth";
import { listDashboardAccounts } from "@/lib/db/accounts";
import { getLastDataDateByAccount } from "@/lib/db/insights";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  // A sessao e lida aqui, no servidor, e desce achatada para a sidebar: ela e
  // client por causa do usePathname, e nao pode (nem precisa) chamar auth().
  const [session, accounts, ultimoDiaPorConta] = await Promise.all([
    auth(),
    listDashboardAccounts(),
    getLastDataDateByAccount(),
  ]);

  return (
    // Em telas estreitas a navegacao vira faixa no topo e a pagina rola inteira;
    // do `md` para cima volta a ser coluna fixa (grid de 2 colunas, nao flex,
    // para a sidebar ficar h-screen de verdade) com o conteudo rolando sozinho.
    // Os `min-w-0` sao o que impede a tabela de campanhas de esticar a pagina em
    // vez de rolar dentro do proprio cartao: filho de grid/flex tem largura
    // minima automatica e nao encolhe abaixo do conteudo sem isso.
    <div className="grid min-h-screen grid-cols-1 md:h-screen md:grid-cols-[14rem_1fr]">
      <Sidebar email={session?.user?.email ?? null} isDemo={session?.user?.isDemo ?? false} />
      <div className="flex min-w-0 flex-col md:h-screen md:overflow-hidden">
        <Topbar accounts={accounts} ultimoDiaPorConta={ultimoDiaPorConta} />
        <main className="min-w-0 flex-1 p-4 md:overflow-y-auto md:p-10">{children}</main>
      </div>
    </div>
  );
}

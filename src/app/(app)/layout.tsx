import type { ReactNode } from "react";
import { listSyncableAccounts } from "@/lib/db/accounts";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const accounts = await listSyncableAccounts();

  return (
    // Grid de 2 colunas (nao flex) para a sidebar ficar h-screen de verdade e o
    // conteudo rolar sozinho, sem a sidebar esticar/encolher com a altura dele.
    <div className="grid h-screen grid-cols-[14rem_1fr]">
      <Sidebar />
      <div className="flex h-screen flex-col overflow-hidden">
        <Topbar accounts={accounts} />
        <main className="flex-1 overflow-y-auto p-10">{children}</main>
      </div>
    </div>
  );
}

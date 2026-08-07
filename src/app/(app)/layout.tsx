import type { ReactNode } from "react";
import { listSyncableAccounts } from "@/lib/db/accounts";
import { Sidebar } from "./_components/sidebar";
import { Topbar } from "./_components/topbar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const accounts = await listSyncableAccounts();

  return (
    <div className="flex min-h-full">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar accounts={accounts} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}

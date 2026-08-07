import type { SyncableAccount } from "@/lib/db/accounts";
import { AccountSelector } from "./account-selector";
import { DateRangePicker } from "./date-range-picker";
import { ThemeToggle } from "./theme-toggle";

export function Topbar({ accounts }: { accounts: SyncableAccount[] }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
      <AccountSelector accounts={accounts} />
      <div className="flex items-center gap-3">
        <DateRangePicker />
        <ThemeToggle />
      </div>
    </header>
  );
}

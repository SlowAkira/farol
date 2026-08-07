"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SyncableAccount } from "@/lib/db/accounts";
import { resolveAccountId, withParams } from "../_lib/search-params";

export function AccountSelector({ accounts }: { accounts: SyncableAccount[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = resolveAccountId(searchParams, accounts);
  const selected = accounts.find((account) => account.id === selectedId);

  if (accounts.length === 0) {
    return <span className="text-sm text-muted-foreground">Nenhuma conta conectada</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="min-w-48 justify-between">
          {selected?.name ?? "Selecionar conta"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            onSelect={() => {
              router.push(`?${withParams(searchParams, { account: account.id })}`);
            }}
          >
            {account.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

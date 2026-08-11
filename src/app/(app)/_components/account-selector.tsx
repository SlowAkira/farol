"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveAccountId, withParams } from "../_lib/search-params";

// Um view model para os dois controles do cabecalho. O seletor de periodo
// precisa do ultimo dia medido da conta aberta, e so descobre qual conta e essa
// no cliente (o layout nao le searchParams); carregar o campo aqui evita uma
// segunda lista, em outra ordem, so para responder isso.
export type AccountOption = {
  readonly id: string;
  readonly name: string;
  readonly desconectada: boolean;
  readonly ultimoDiaComDado: string | null;
};

// Marca em texto, e nao em cor: "desconectada" precisa ser legivel sem depender
// de enxergar um ponto vermelho, e o vermelho aqui colidiria com o vermelho de
// piora dos KPIs, que quer dizer outra coisa.
function DisconnectedTag() {
  return <span className="ml-2 text-label whitespace-nowrap text-muted-foreground">desconectada</span>;
}

export function AccountSelector({ accounts }: { accounts: readonly AccountOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = resolveAccountId(searchParams, accounts);
  const selected = accounts.find((account) => account.id === selectedId);

  if (accounts.length === 0) {
    return <span className="text-body text-muted-foreground">Nenhuma conta conectada</span>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="min-w-48 max-w-full justify-between">
          <span className="truncate">{selected?.name ?? "Selecionar conta"}</span>
          {selected?.desconectada ? <DisconnectedTag /> : null}
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
            <span className="truncate">{account.name}</span>
            {account.desconectada ? <DisconnectedTag /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

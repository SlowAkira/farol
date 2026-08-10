import { AccountStatus, type Platform } from "@/generated/prisma/enums";
import { getPrisma } from "./client";

export type SyncableAccount = {
  readonly id: string;
  readonly name: string;
  readonly platform: Platform;
  // Toda moeda formatada no painel sai daqui: valor em centavos so vira texto
  // legivel sabendo a moeda da conta que o gerou, nunca uma moeda fixa da app.
  readonly currency: string;
};

// Nao e `status: ACTIVE`. Quem decide o que da para sincronizar e o syncAccount,
// e la so DISCONNECTED e recusada: conta PAUSED perdeu a veiculacao, nao o
// historico, e o painel continua mostrando esse historico. Filtrar por ACTIVE
// aqui congelaria os numeros das pausadas sem erro nenhum aparecer.
export async function listSyncableAccounts(): Promise<SyncableAccount[]> {
  return getPrisma().adAccount.findMany({
    where: { status: { not: AccountStatus.DISCONNECTED } },
    select: { id: true, name: true, platform: true, currency: true },
    orderBy: { createdAt: "asc" },
  });
}

export type DashboardAccount = SyncableAccount & { readonly status: AccountStatus };

// "O que da para sincronizar" e "o que da para mostrar" sao perguntas
// diferentes, e por isso duas funcoes. A conta desconectada nao entra no sync,
// mas precisa aparecer no painel: escondida, ela vira uma conta que sumiu da
// lista sem explicacao, e o usuario fica sem saber que basta reconectar.
export async function listDashboardAccounts(): Promise<DashboardAccount[]> {
  const accounts = await getPrisma().adAccount.findMany({
    select: { id: true, name: true, platform: true, currency: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  // Desconectada vai para o fim da lista, e nao some dela: precisa continuar
  // alcancavel para o painel poder explicar o que houve, mas nunca deve ser a
  // conta que abre por padrao quando existe uma conectada. A ordem sai daqui, e
  // nao de cada chamador, porque a topbar e a pagina resolvem a conta padrao
  // separadamente -- ordenar so num dos dois faz o seletor rotular uma conta
  // enquanto o painel mostra os numeros de outra. `sort` e estavel, entao a
  // ordem de criacao se mantem dentro de cada grupo.
  return accounts.sort((a, b) => Number(isDisconnected(a)) - Number(isDisconnected(b)));
}

// Mantem o enum do Prisma dentro de src/lib/db: o componente pergunta "esta
// desconectada?" e nao precisa importar o schema para saber a resposta.
export function isDisconnected(account: DashboardAccount): boolean {
  return account.status === AccountStatus.DISCONNECTED;
}

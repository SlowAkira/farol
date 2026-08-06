import { AccountStatus, type Platform } from "@/generated/prisma/enums";
import { getPrisma } from "./client";

export type SyncableAccount = {
  readonly id: string;
  readonly name: string;
  readonly platform: Platform;
};

// Nao e `status: ACTIVE`. Quem decide o que da para sincronizar e o syncAccount,
// e la so DISCONNECTED e recusada: conta PAUSED perdeu a veiculacao, nao o
// historico, e o painel continua mostrando esse historico. Filtrar por ACTIVE
// aqui congelaria os numeros das pausadas sem erro nenhum aparecer.
export async function listSyncableAccounts(): Promise<SyncableAccount[]> {
  return getPrisma().adAccount.findMany({
    where: { status: { not: AccountStatus.DISCONNECTED } },
    select: { id: true, name: true, platform: true },
    orderBy: { createdAt: "asc" },
  });
}

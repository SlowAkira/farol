"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { AlertStatus } from "@/generated/prisma/enums";
import { assertWritable } from "@/lib/auth/demo-guard";
import { setAlertStatus } from "@/lib/db/alerts";

// Resultado como valor, nunca excecao (CLAUDE.md): o botao mostra a mensagem ao
// lado dele em vez de a pagina inteira cair numa fronteira de erro.
export type AlertActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const SEM_SESSAO = "Sua sessão expirou. Entre de novo para alterar alertas.";
const JA_MUDOU =
  "Este alerta não está mais aberto. Recarregue a página para ver o estado atual.";

async function mudarStatus(
  alertId: string,
  status: typeof AlertStatus.MUTED | typeof AlertStatus.RESOLVED,
): Promise<AlertActionResult> {
  const session = await auth();

  // A guarda de demo roda no servidor mesmo com o botao desabilitado na tela:
  // desabilitar e affordance, nao permissao -- a action e um endpoint publico.
  const readOnly = assertWritable(session);
  if (readOnly) {
    return { ok: false, message: readOnly.message };
  }

  const userId = session?.user?.id;
  if (!userId) {
    return { ok: false, message: SEM_SESSAO };
  }

  // O userId entra no where la dentro: o alertId chega do cliente e nao prova
  // posse de nada sozinho.
  if (!(await setAlertStatus(alertId, userId, status))) {
    return { ok: false, message: JA_MUDOU };
  }

  revalidatePath("/alerts");
  return { ok: true };
}

export async function silenciarAlerta(alertId: string): Promise<AlertActionResult> {
  return mudarStatus(alertId, AlertStatus.MUTED);
}

export async function resolverAlerta(alertId: string): Promise<AlertActionResult> {
  return mudarStatus(alertId, AlertStatus.RESOLVED);
}

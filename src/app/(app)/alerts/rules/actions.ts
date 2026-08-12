"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  parseRuleCondition,
  parseRuleForm,
  type RuleConditionValues,
  type RuleFormErrors,
  type RuleFormValues,
} from "@/lib/alerts/form";
import { previewRuleBacktest } from "@/lib/alerts/preview";
import type { BacktestPreview } from "@/lib/alerts/preview-result";
import { assertWritable } from "@/lib/auth/demo-guard";
import {
  accountBelongsToUser,
  createAlertRule,
  deleteAlertRule,
  setAlertRuleEnabled,
  updateAlertRule,
} from "@/lib/db/alerts";

// Tres tipos de resposta e nao um so: o formulario trata erro de campo pintando
// o campo, e erro de contexto (sessao, posse, demo) mostrando uma linha acima do
// botao. Achatar os dois num `message` faria a mensagem do limiar aparecer longe
// do limiar.
export type RuleSaveResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly errors: RuleFormErrors; readonly message: string | null };

export type RulePreviewResult =
  | { readonly ok: true; readonly preview: BacktestPreview }
  | { readonly ok: false; readonly errors: RuleFormErrors; readonly message: string | null };

export type RuleActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

const SEM_SESSAO = "Sua sessão expirou. Entre de novo para editar regras.";
const SEM_CONTA = "Esta conta de anúncios não está disponível para o seu usuário.";
const NAO_ENCONTRADA = "Esta regra não existe mais. Recarregue a página.";
const NOME_DUPLICADO = "Você já tem uma regra com esse nome.";

type Sessao =
  | { readonly ok: true; readonly userId: string }
  | { readonly ok: false; readonly message: string };

// Preview le, as outras escrevem: por isso a guarda de demo e parametro. A conta
// demo precisa poder simular uma regra -- e o que a tela tem de melhor a mostrar
// -- e nao pode gravar nenhuma.
async function sessao({ escrita }: { escrita: boolean }): Promise<Sessao> {
  const session = await auth();

  if (escrita) {
    const readOnly = assertWritable(session);
    if (readOnly) {
      return { ok: false, message: readOnly.message };
    }
  }

  const userId = session?.user?.id;
  return userId ? { ok: true, userId } : { ok: false, message: SEM_SESSAO };
}

// Recebe a condicao sem o nome: simular uma regra que ainda nao tem nome e o
// caso normal, e nao a excecao.
export async function previewRule(
  adAccountId: string,
  values: RuleConditionValues,
): Promise<RulePreviewResult> {
  const atual = await sessao({ escrita: false });
  if (!atual.ok) {
    return { ok: false, errors: {}, message: atual.message };
  }

  // O adAccountId chega do formulario. Sem esta checagem o preview viraria um
  // jeito de ler o historico de qualquer conta do banco pelo id.
  if (!(await accountBelongsToUser(adAccountId, atual.userId))) {
    return { ok: false, errors: {}, message: SEM_CONTA };
  }

  const parsed = parseRuleCondition(values);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, message: null };
  }

  // O id vazio nao chega ao banco: o backtest so precisa dele para o fingerprint
  // interno, que aqui nunca e gravado.
  const preview = await previewRuleBacktest(adAccountId, { id: "", ...parsed.value });
  return { ok: true, preview };
}

export async function saveRule(
  adAccountId: string,
  ruleId: string | null,
  values: RuleFormValues,
): Promise<RuleSaveResult> {
  const atual = await sessao({ escrita: true });
  if (!atual.ok) {
    return { ok: false, errors: {}, message: atual.message };
  }

  if (!(await accountBelongsToUser(adAccountId, atual.userId))) {
    return { ok: false, errors: {}, message: SEM_CONTA };
  }

  const parsed = parseRuleForm(values);
  if (!parsed.ok) {
    return { ok: false, errors: parsed.errors, message: null };
  }

  const resultado =
    ruleId === null
      ? await createAlertRule(atual.userId, adAccountId, parsed.value)
      : await updateAlertRule(ruleId, atual.userId, parsed.value);

  if (!resultado.ok) {
    return resultado.code === "NOME_DUPLICADO"
      ? { ok: false, errors: { name: NOME_DUPLICADO }, message: null }
      : { ok: false, errors: {}, message: NAO_ENCONTRADA };
  }

  // As duas rotas: a lista de regras e o feed, que mostra o nome da regra em
  // cada cartao e a contagem de regras no estado vazio.
  revalidatePath("/alerts/rules");
  revalidatePath("/alerts");
  return { ok: true, id: resultado.id };
}

export async function toggleRule(ruleId: string, enabled: boolean): Promise<RuleActionResult> {
  const atual = await sessao({ escrita: true });
  if (!atual.ok) {
    return { ok: false, message: atual.message };
  }

  if (!(await setAlertRuleEnabled(ruleId, atual.userId, enabled))) {
    return { ok: false, message: NAO_ENCONTRADA };
  }

  revalidatePath("/alerts/rules");
  revalidatePath("/alerts");
  return { ok: true };
}

export async function removeRule(ruleId: string): Promise<RuleActionResult> {
  const atual = await sessao({ escrita: true });
  if (!atual.ok) {
    return { ok: false, message: atual.message };
  }

  if (!(await deleteAlertRule(ruleId, atual.userId))) {
    return { ok: false, message: NAO_ENCONTRADA };
  }

  revalidatePath("/alerts/rules");
  revalidatePath("/alerts");
  return { ok: true };
}

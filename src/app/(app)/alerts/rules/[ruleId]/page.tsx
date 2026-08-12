import { SearchX } from "lucide-react";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/reveal";
import { assertWritable } from "@/lib/auth/demo-guard";
import { getAlertRule } from "@/lib/db/alerts";
import type { SearchParamsInput } from "../../../_lib/search-params";
import { alertsHref, resolveAlertsAccount } from "../../_lib/account";
import { RuleForm } from "../_components/rule-form";
import { RulesShell, EmptyCard } from "../_components/rules-shell";
import { previewInicial, ruleToValues } from "../_lib/editor";

export default async function EditAlertRulePage({
  params,
  searchParams,
}: {
  params: Promise<{ ruleId: string }>;
  searchParams: Promise<SearchParamsInput>;
}) {
  const [{ ruleId }, account, session] = await Promise.all([
    params,
    resolveAlertsAccount(await searchParams),
    auth(),
  ]);

  const userId = session?.user?.id;
  if (account === null || !userId) {
    notFound();
  }

  // O userId entra na consulta: o ruleId vem da URL, e uma regra de outro dono
  // precisa responder "nao existe", e nao o formulario dela.
  const rule = await getAlertRule(ruleId, userId);
  const lista = alertsHref("/alerts/rules", account.id);

  if (rule === null) {
    return (
      <RulesShell titulo="Regra de alerta" voltarPara={lista}>
        <EmptyCard>
          <EmptyState
            icon={SearchX}
            titulo="Regra não encontrada"
            descricao="Esta regra não existe mais ou não pertence à sua conta. Ela pode ter sido excluída em outra aba."
          />
        </EmptyCard>
      </RulesShell>
    );
  }

  const valores = ruleToValues(rule);
  const readOnly = assertWritable(session);

  return (
    <RulesShell titulo={rule.name} subtitulo={account.name} voltarPara={lista}>
      <Reveal>
        <RuleForm
          adAccountId={account.id}
          currency={account.currency}
          ruleId={rule.id}
          valoresIniciais={valores}
          previewInicial={await previewInicial(account.id, valores)}
          readOnlyMessage={readOnly?.message ?? null}
          voltarPara={lista}
        />
      </Reveal>
    </RulesShell>
  );
}

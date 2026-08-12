import { Inbox } from "lucide-react";
import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/reveal";
import { assertWritable } from "@/lib/auth/demo-guard";
import type { SearchParamsInput } from "../../../_lib/search-params";
import { alertsHref, resolveAlertsAccount } from "../../_lib/account";
import { RuleForm } from "../_components/rule-form";
import { RulesShell, EmptyCard } from "../_components/rules-shell";
import { previewInicial, VALORES_PADRAO } from "../_lib/editor";

export default async function NewAlertRulePage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const account = await resolveAlertsAccount(await searchParams);

  if (account === null) {
    return (
      <RulesShell titulo="Nova regra" voltarPara="/alerts">
        <EmptyCard>
          <EmptyState
            icon={Inbox}
            titulo="Nenhuma conta de anúncios conectada"
            descricao="Regra de alerta pertence a uma conta de anúncios. Conecte uma conta para criar a primeira."
          />
        </EmptyCard>
      </RulesShell>
    );
  }

  const readOnly = assertWritable(await auth());
  const lista = alertsHref("/alerts/rules", account.id);

  return (
    <RulesShell titulo="Nova regra" subtitulo={account.name} voltarPara={lista}>
      <Reveal>
        <RuleForm
          adAccountId={account.id}
          currency={account.currency}
          ruleId={null}
          valoresIniciais={VALORES_PADRAO}
          previewInicial={await previewInicial(account.id, VALORES_PADRAO)}
          readOnlyMessage={readOnly?.message ?? null}
          voltarPara={lista}
        />
      </Reveal>
    </RulesShell>
  );
}

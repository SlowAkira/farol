import { BellPlus, Inbox } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ruleSentence } from "@/lib/alerts/labels";
import { assertWritable } from "@/lib/auth/demo-guard";
import { countOpenAlertsByRule, listAlertRules, type AlertRuleRow } from "@/lib/db/alerts";
import type { SearchParamsInput } from "../../_lib/search-params";
import { alertsHref, resolveAlertsAccount } from "../_lib/account";
import { RuleToggle } from "./_components/rule-toggle";
import { RulesShell, EmptyCard } from "./_components/rules-shell";

function contagem(abertos: number): string {
  if (abertos === 0) {
    return "Nenhum alerta aberto";
  }
  return abertos === 1 ? "1 alerta aberto" : `${abertos} alertas abertos`;
}

function RuleRow({
  rule,
  currency,
  abertos,
  href,
  readOnly,
}: {
  rule: AlertRuleRow;
  currency: string;
  abertos: number;
  href: string;
  readOnly: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* O nome inteiro e o alvo do clique, e nao um "Editar" ao lado: a
                regra e o que se abre, e o nome dela e o unico rotulo que
                identifica qual. */}
            <Link
              href={href}
              className="transition-interactive text-body font-medium text-foreground hover:text-brand-link focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {rule.name}
            </Link>
            {rule.enabled ? null : (
              // Selo neutro: pausada e uma escolha de quem configurou, nao um
              // problema, e ambar aqui competiria com o alerta de verdade.
              <span className="rounded-full bg-muted px-2 py-0.5 text-label text-muted-foreground">
                pausada
              </span>
            )}
          </div>
          <p className="text-body text-muted-foreground">{ruleSentence(rule, currency)}</p>
          {/* O que a regra esta produzindo, e nao so como ela esta configurada:
              e o numero que diz se ela vale a pena. */}
          <p className="text-label text-muted-foreground tabular-nums">{contagem(abertos)}</p>
        </div>
        <RuleToggle
          ruleId={rule.id}
          ruleName={rule.name}
          enabled={rule.enabled}
          readOnly={readOnly}
        />
      </CardContent>
    </Card>
  );
}

export default async function AlertRulesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const account = await resolveAlertsAccount(await searchParams);

  if (account === null) {
    return (
      <RulesShell titulo="Regras de alerta" voltarPara="/alerts">
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

  const voltarPara = alertsHref("/alerts", account.id);
  const novaRegra = alertsHref("/alerts/rules/new", account.id);
  const readOnly = assertWritable(await auth());
  const [rules, abertos] = await Promise.all([
    listAlertRules(account.id),
    countOpenAlertsByRule(account.id),
  ]);

  if (rules.length === 0) {
    return (
      <RulesShell titulo="Regras de alerta" subtitulo={account.name} voltarPara={voltarPara}>
        <EmptyCard>
          <EmptyState
            icon={BellPlus}
            titulo="Nenhuma regra de alerta cadastrada"
            descricao="Sem regra não há o que disparar. Crie a primeira para o Farol avisar quando o CPA subir, o ROAS cair ou o gasto fugir do esperado — antes de gravar, o preview mostra quantas vezes ela teria disparado nos últimos 90 dias."
            acao={
              <Button asChild size="sm">
                <Link href={novaRegra}>Criar a primeira regra</Link>
              </Button>
            }
          />
        </EmptyCard>
      </RulesShell>
    );
  }

  return (
    <RulesShell
      titulo="Regras de alerta"
      subtitulo={account.name}
      voltarPara={voltarPara}
      acao={
        <Button asChild size="sm">
          <Link href={novaRegra}>Nova regra</Link>
        </Button>
      }
    >
      <Reveal>
        <div className="flex flex-col gap-3">
          {rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              currency={account.currency}
              abertos={abertos[rule.id] ?? 0}
              href={alertsHref(`/alerts/rules/${rule.id}`, account.id)}
              readOnly={readOnly !== null}
            />
          ))}
        </div>
      </Reveal>
    </RulesShell>
  );
}

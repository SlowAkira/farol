import { Inbox, Unplug } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { auth } from "@/auth";
import { BlockBoundary } from "@/components/block-boundary";
import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { assertWritable } from "@/lib/auth/demo-guard";
import { isDisconnected } from "@/lib/db/accounts";
import { listAlertRules } from "@/lib/db/alerts";
import type { SearchParamsInput } from "../_lib/search-params";
import { alertsHref, resolveAlertsAccount } from "./_lib/account";
import { AlertFeed } from "./_components/alert-feed";
import { AlertFeedSkeleton } from "./_components/alert-feed-skeleton";

function Shell({
  subtitulo,
  acao,
  children,
}: {
  subtitulo?: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-section font-semibold">Alertas</h1>
          {subtitulo ? <p className="text-muted-foreground">{subtitulo}</p> : null}
        </div>
        {acao}
      </header>
      {children}
    </div>
  );
}

function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const account = await resolveAlertsAccount(await searchParams);

  if (account === null) {
    return (
      <Shell>
        <EmptyCard>
          <EmptyState
            icon={Inbox}
            titulo="Nenhuma conta de anúncios conectada"
            descricao="Conecte uma conta para o Farol ingerir métricas diárias e avaliar as regras de alerta ao final de cada sincronização."
          />
        </EmptyCard>
      </Shell>
    );
  }

  const regras = (
    <Button asChild variant="outline" size="sm">
      <Link href={alertsHref("/alerts/rules", account.id)}>Regras</Link>
    </Button>
  );

  if (isDisconnected(account)) {
    return (
      <Shell subtitulo={account.name} acao={regras}>
        <EmptyCard>
          <EmptyState
            icon={Unplug}
            tone="alerta"
            titulo="Conta desconectada"
            descricao="O Farol perdeu o acesso a esta conta e parou de ingerir métricas novas, então nenhuma regra é avaliada. Os alertas já abertos continuam salvos — reconecte a conta para voltar a receber dados."
          />
        </EmptyCard>
      </Shell>
    );
  }

  // A guarda de demo resolve aqui, uma vez, e desce como mensagem: cada cartao
  // do feed teria que consultar a sessao por conta propria, e um leaf client nao
  // pode consultar sessao nenhuma.
  const readOnly = assertWritable(await auth());
  const temRegra = (await listAlertRules(account.id)).length > 0;

  return (
    <Shell subtitulo={account.name} acao={regras}>
      <Reveal>
        <BlockBoundary titulo="Não foi possível carregar os alertas">
          <Suspense fallback={<AlertFeedSkeleton />}>
            <AlertFeed
              account={account}
              readOnlyMessage={readOnly?.message ?? null}
              temRegra={temRegra}
            />
          </Suspense>
        </BlockBoundary>
      </Reveal>
    </Shell>
  );
}

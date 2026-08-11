import { Inbox, Unplug } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { BlockBoundary } from "@/components/block-boundary";
import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/reveal";
import { Card, CardContent } from "@/components/ui/card";
import { resolveCampaignSort } from "@/lib/campaigns/sort";
import { formatPeriod } from "@/lib/format";
import { isDisconnected, listDashboardAccounts } from "@/lib/db/accounts";
import { getAccountLastDataDate } from "@/lib/db/insights";
import {
  periodAnchor,
  readParam,
  resolveAccountId,
  resolvePeriod,
  type SearchParamsInput,
} from "../_lib/search-params";
import { CampaignsTable } from "./_components/campaigns-table";
import { CampaignsTableSkeleton } from "./_components/campaigns-table-skeleton";

function Shell({ subtitulo, children }: { subtitulo?: string; children: ReactNode }) {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-section font-semibold">Campanhas</h1>
        {subtitulo ? <p className="text-muted-foreground">{subtitulo}</p> : null}
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

// searchParams chega como objeto simples; a tabela monta os links de ordenacao a
// partir dele e precisa preservar conta e periodo, entao vira URLSearchParams uma
// vez aqui em vez de em cada cabecalho.
function toQuery(params: SearchParamsInput): URLSearchParams {
  if (params instanceof URLSearchParams) {
    return new URLSearchParams(params);
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const primeiro = Array.isArray(value) ? value[0] : value;
    if (primeiro !== undefined) {
      query.set(key, primeiro);
    }
  }
  return query;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const params = await searchParams;
  // A mesma lista que a topbar recebe, e nao a de contas sincronizaveis: com o
  // periodo saindo da conta, resolver a conta de outro jeito aqui faz o seletor
  // de periodo e a pagina ancorarem em datas diferentes.
  const accounts = await listDashboardAccounts();
  const accountId = resolveAccountId(params, accounts);

  if (accountId === null) {
    return (
      <Shell>
        <EmptyCard>
          <EmptyState
            icon={Inbox}
            titulo="Nenhuma conta de anúncios conectada"
            descricao="Conecte uma conta para o Farol começar a ingerir métricas diárias e listar as campanhas dela aqui."
          />
        </EmptyCard>
      </Shell>
    );
  }

  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    throw new Error(`Conta ${accountId} passou pela resolucao mas sumiu da lista.`);
  }

  const period = resolvePeriod(params, periodAnchor(await getAccountLastDataDate(accountId)));
  const periodoLabel = `${account.name} · ${formatPeriod(period.since, period.until)}`;

  if (isDisconnected(account)) {
    return (
      <Shell subtitulo={periodoLabel}>
        <EmptyCard>
          <EmptyState
            icon={Unplug}
            tone="alerta"
            titulo="Conta desconectada"
            descricao="O Farol perdeu o acesso a esta conta e parou de ingerir métricas novas. O histórico já coletado continua salvo — reconecte a conta para voltar a receber dados."
          />
        </EmptyCard>
      </Shell>
    );
  }

  const sort = resolveCampaignSort(readParam(params, "sort"), readParam(params, "dir"));

  return (
    <Shell subtitulo={periodoLabel}>
      {/* Fronteira de erro e Suspense pelo mesmo motivo do dashboard: a consulta
          que falha derruba o cartao, nao a pagina, e o cabecalho com conta e
          periodo continua na tela enquanto a tabela carrega. */}
      <Reveal>
        <BlockBoundary titulo="Não foi possível carregar as campanhas">
          <Suspense fallback={<CampaignsTableSkeleton />}>
            <CampaignsTable
              accountId={accountId}
              currency={account.currency}
              period={period}
              sort={sort}
              params={toQuery(params)}
            />
          </Suspense>
        </BlockBoundary>
      </Reveal>
    </Shell>
  );
}

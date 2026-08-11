import { Inbox, Unplug } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { BlockBoundary } from "@/components/block-boundary";
import { EmptyState } from "@/components/empty-state";
import { Reveal } from "@/components/reveal";
import { Card, CardContent } from "@/components/ui/card";
import { formatPeriod } from "@/lib/format";
import { isDisconnected, listDashboardAccounts } from "@/lib/db/accounts";
import { getCampaignRoster } from "@/lib/db/campaigns";
import { getAccountLastDataDate } from "@/lib/db/insights";
import {
  periodAnchor,
  resolveAccountId,
  resolvePeriod,
  type SearchParamsInput,
} from "../_lib/search-params";
import { KpiRow } from "./_components/kpi-row";
import {
  KpiRowSkeleton,
  TopCampaignsSkeleton,
  TrendSectionSkeleton,
} from "./_components/skeletons";
import { TopCampaigns } from "./_components/top-campaigns";
import { TrendSection } from "./_components/trend-section";

function Shell({ subtitulo, children }: { subtitulo?: string; children: ReactNode }) {
  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-section font-semibold">Dashboard</h1>
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsInput>;
}) {
  const params = await searchParams;
  const accounts = await listDashboardAccounts();

  // listDashboardAccounts ja entrega as desconectadas no fim, que e a mesma
  // ordem que a topbar recebe: as duas resolvem a conta padrao por conta propria
  // e precisam chegar na mesma.
  const accountId = resolveAccountId(params, accounts);

  // O periodo depende da conta, entao so sai depois dela: e o ultimo dia que a
  // ingestao desta conta alcancou que fecha o periodo padrao, nao o calendario.
  const period = resolvePeriod(
    params,
    periodAnchor(accountId === null ? null : await getAccountLastDataDate(accountId)),
  );

  if (!accountId) {
    return (
      <Shell>
        <EmptyCard>
          <EmptyState
            icon={Inbox}
            titulo="Nenhuma conta de anúncios conectada"
            descricao="Conecte uma conta para o Farol começar a ingerir métricas diárias e montar o painel."
          />
        </EmptyCard>
      </Shell>
    );
  }

  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account) {
    throw new Error(`Conta ${accountId} passou pela resolucao mas sumiu da lista.`);
  }

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

  // Conta sem nenhuma campanha nao tem KPI, evolucao nem tabela: os tres blocos
  // diriam a mesma coisa. Um vazio so, no lugar da pagina, e mais honesto do que
  // tres cartoes vazios empilhados.
  const roster = await getCampaignRoster(accountId);
  if (roster.total === 0) {
    return (
      <Shell subtitulo={periodoLabel}>
        <EmptyCard>
          <EmptyState
            icon={Inbox}
            titulo="Nenhuma campanha nesta conta"
            descricao="A conta está conectada, mas ainda não há campanha registrada. Assim que a primeira campanha rodar, ela aparece aqui na próxima sincronização."
          />
        </EmptyCard>
      </Shell>
    );
  }

  const section = { accountId, currency: account.currency, period };

  // Um Suspense por bloco, e nao um em volta da pagina inteira: os KPIs, o
  // grafico e a tabela vem de consultas independentes, entao cada um aparece
  // assim que o seu dado chega. Sem `key` de proposito -- ao trocar de periodo o
  // Next segura o render anterior durante a transicao, e reintroduzir o esqueleto
  // ali seria piscada, nao carregamento.
  //
  // Uma fronteira de erro por bloco pelo mesmo motivo: a consulta que falha
  // derruba so o seu cartao, e os outros dois seguem mostrando dado correto.
  return (
    <Shell subtitulo={periodoLabel}>
      {/* Reveal por fora do Suspense, e nao por dentro: o esqueleto nao anima
          entrada, e envolver o fallback faria o bloco deslizar duas vezes --
          uma ao aparecer o esqueleto, outra ao chegar o dado. */}
      <Reveal>
        <BlockBoundary titulo="Não foi possível carregar os indicadores">
          <Suspense fallback={<KpiRowSkeleton />}>
            <KpiRow {...section} />
          </Suspense>
        </BlockBoundary>
      </Reveal>

      <Reveal>
        <BlockBoundary titulo="Não foi possível carregar a evolução">
          <Suspense fallback={<TrendSectionSkeleton />}>
            <TrendSection {...section} />
          </Suspense>
        </BlockBoundary>
      </Reveal>

      <Reveal>
        <BlockBoundary titulo="Não foi possível carregar as campanhas">
          <Suspense fallback={<TopCampaignsSkeleton />}>
            <TopCampaigns {...section} roster={roster} />
          </Suspense>
        </BlockBoundary>
      </Reveal>
    </Shell>
  );
}

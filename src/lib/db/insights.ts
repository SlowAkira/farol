import type { CampaignObjective, CampaignStatus } from "@/generated/prisma/enums";
import { addDays, daysBetween, isIsoDate } from "@/lib/dates";
import { computeMetrics, type Metrics, type MetricTotals } from "@/lib/metrics/calc";
import { getPrisma } from "./client";

export type Period = {
  readonly since: string;
  readonly until: string;
};

export type DailyTotals = MetricTotals & {
  readonly date: string;
  // Zero e ausencia sao coisas diferentes e os totais sozinhos nao distinguem as
  // duas: um dia sem nenhum insight e um dia que rodou e gastou zero chegam aqui
  // identicos. Quem plota precisa dessa diferenca -- desenhar ausencia como zero
  // inventa uma queda a pique que nao existiu.
  readonly hasData: boolean;
};

export type CampaignBreakdownRow = {
  readonly campaignId: string;
  readonly externalId: string;
  readonly name: string;
  readonly objective: CampaignObjective;
  readonly status: CampaignStatus;
  readonly totals: MetricTotals;
  readonly metrics: Metrics;
};

function assertPeriod(since: string, until: string): void {
  if (!isIsoDate(since) || !isIsoDate(until)) {
    throw new RangeError(`Periodo invalido: "${since}" a "${until}". Use o formato YYYY-MM-DD.`);
  }
}

const ZERO_TOTALS: MetricTotals = {
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  conversionValueCents: 0,
  reach: 0,
};

const SUM_SELECT = {
  impressions: true,
  clicks: true,
  spendCents: true,
  conversions: true,
  conversionValueCents: true,
  reach: true,
} as const;

function totalsFromSum(sum: {
  impressions: number | null;
  clicks: number | null;
  spendCents: number | null;
  conversions: number | null;
  conversionValueCents: number | null;
  reach: number | null;
}): MetricTotals {
  return {
    impressions: sum.impressions ?? 0,
    clicks: sum.clicks ?? 0,
    spendCents: sum.spendCents ?? 0,
    conversions: sum.conversions ?? 0,
    conversionValueCents: sum.conversionValueCents ?? 0,
    reach: sum.reach ?? 0,
  };
}

// _sum do Prisma ja compila para SUM(...) no Postgres: a soma acontece no
// banco, isto aqui so troca null (nenhuma linha no periodo) por zero.
export async function getAccountTotals(
  accountId: string,
  since: string,
  until: string,
): Promise<MetricTotals> {
  assertPeriod(since, until);

  const { _sum } = await getPrisma().dailyInsight.aggregate({
    where: { date: { gte: since, lte: until }, campaign: { adAccountId: accountId } },
    _sum: SUM_SELECT,
  });

  return totalsFromSum(_sum);
}

// Cogitado $queryRaw com generate_series para o zero-fill, mas o adaptador
// @prisma/adapter-pg so aplica a opcao `schema` nas queries que o proprio
// Prisma compila (aggregate, groupBy, etc.) -- ele nunca da SET search_path na
// conexao. SQL cru sai sem qualificacao nenhuma e, sob o schema por worker dos
// testes (src/test/db.ts), lê o schema errado (o padrao da conexao) em vez do
// schema isolado, voltando zerado em silencio. sync.ts evita $queryRaw pelo
// mesmo motivo; groupBy aqui soma no Postgres do mesmo jeito, so o zero-fill
// dos dias sem insight (sintese de linha vazia, no soma nenhuma) e que roda em
// JavaScript.
export async function getDailySeries(
  accountId: string,
  since: string,
  until: string,
): Promise<DailyTotals[]> {
  assertPeriod(since, until);

  const grouped = await getPrisma().dailyInsight.groupBy({
    by: ["date"],
    where: { date: { gte: since, lte: until }, campaign: { adAccountId: accountId } },
    _sum: SUM_SELECT,
  });
  const totalsByDate = new Map(grouped.map((row) => [row.date, totalsFromSum(row._sum)]));

  const daysInPeriod = daysBetween(since, until);
  return Array.from({ length: daysInPeriod + 1 }, (_, offset) => {
    const date = addDays(since, offset);
    const totals = totalsByDate.get(date);
    return { date, hasData: totals !== undefined, ...(totals ?? ZERO_TOTALS) };
  });
}

export type CampaignDailySeries = {
  readonly campaignId: string;
  readonly name: string;
  readonly days: readonly DailyTotals[];
};

// getDailySeries por campanha, numa consulta so. O backtest precisa avaliar cada
// campanha em separado em cada um dos 90 dias, e o mini grafico do alerta precisa
// da serie da campanha que disparou -- pedir dia a dia, ou campanha a campanha,
// seriam centenas de idas ao banco para o mesmo GROUP BY.
//
// So entra campanha com pelo menos um insight no intervalo, como em
// getCampaignBreakdown: o zero-fill preenche os dias de dentro do periodo, nao
// inventa campanha que nunca rodou nele.
export async function getCampaignDailySeries(
  accountId: string,
  since: string,
  until: string,
): Promise<CampaignDailySeries[]> {
  assertPeriod(since, until);

  const prisma = getPrisma();
  const grouped = await prisma.dailyInsight.groupBy({
    by: ["campaignId", "date"],
    where: { date: { gte: since, lte: until }, campaign: { adAccountId: accountId } },
    _sum: SUM_SELECT,
  });

  if (grouped.length === 0) {
    return [];
  }

  const campaignIds = [...new Set(grouped.map((row) => row.campaignId))];
  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: campaignIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));

  const totalsByCampaign = new Map<string, Map<string, MetricTotals>>();
  for (const row of grouped) {
    const porData = totalsByCampaign.get(row.campaignId) ?? new Map<string, MetricTotals>();
    porData.set(row.date, totalsFromSum(row._sum));
    totalsByCampaign.set(row.campaignId, porData);
  }

  const daysInPeriod = daysBetween(since, until);

  return campaignIds.map((campaignId) => {
    const porData = totalsByCampaign.get(campaignId) ?? new Map<string, MetricTotals>();

    return {
      campaignId,
      // FK garante o nome; se sumir, o id continua identificando a serie melhor
      // do que uma string vazia identificaria.
      name: nameById.get(campaignId) ?? campaignId,
      days: Array.from({ length: daysInPeriod + 1 }, (_, offset) => {
        const date = addDays(since, offset);
        const totals = porData.get(date);
        return { date, hasData: totals !== undefined, ...(totals ?? ZERO_TOTALS) };
      }),
    };
  });
}

// Soma por campanha via groupBy, que tambem compila para GROUP BY no Postgres:
// so entra campanha com pelo menos um insight no periodo, porque isto e a
// listagem de quem contribuiu no periodo, nao o catalogo inteiro da conta.
export async function getCampaignBreakdown(
  accountId: string,
  since: string,
  until: string,
): Promise<CampaignBreakdownRow[]> {
  assertPeriod(since, until);

  const prisma = getPrisma();
  const grouped = await prisma.dailyInsight.groupBy({
    by: ["campaignId"],
    where: { date: { gte: since, lte: until }, campaign: { adAccountId: accountId } },
    _sum: SUM_SELECT,
  });

  if (grouped.length === 0) {
    return [];
  }

  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: grouped.map((row) => row.campaignId) } },
    select: { id: true, externalId: true, name: true, objective: true, status: true },
  });
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));

  return grouped
    .map((row) => {
      const campaign = campaignById.get(row.campaignId);
      if (!campaign) {
        // FK garante que isso nao acontece; se acontecer e bug de outro lugar,
        // nao periodo mal formado, entao nao vira um retorno de erro tipado.
        throw new Error(`Campanha ${row.campaignId} sumiu entre a agregacao e a busca dos dados.`);
      }

      const totals = totalsFromSum(row._sum);

      return {
        campaignId: campaign.id,
        externalId: campaign.externalId,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status,
        totals,
        metrics: computeMetrics(totals),
      };
    })
    .sort((a, b) => b.totals.spendCents - a.totals.spendCents);
}

export type CampaignTableRow = CampaignBreakdownRow & {
  // Mesma distincao de DailyTotals, um nivel acima: campanha sem nenhum insight
  // no periodo chega com os totais zerados, identica a uma que rodou e gastou
  // zero. Quem monta a linha precisa saber a diferenca para nao escrever "R$ 0"
  // onde ninguem mediu nada.
  readonly hasData: boolean;
};

// Irma de getCampaignBreakdown, com a pergunta invertida. La e "quem contribuiu
// no periodo", e campanha sem insight fica de fora de proposito. Aqui e o
// catalogo da conta: campanha que nao rodou no periodo continua sendo campanha
// da conta, e some-la faria a lista mudar de tamanho conforme o periodo, o que
// se le como campanha excluida.
export async function getCampaignTable(
  accountId: string,
  since: string,
  until: string,
): Promise<CampaignTableRow[]> {
  assertPeriod(since, until);

  const prisma = getPrisma();
  const [campaigns, grouped] = await Promise.all([
    prisma.campaign.findMany({
      where: { adAccountId: accountId },
      select: { id: true, externalId: true, name: true, objective: true, status: true },
    }),
    prisma.dailyInsight.groupBy({
      by: ["campaignId"],
      where: { date: { gte: since, lte: until }, campaign: { adAccountId: accountId } },
      _sum: SUM_SELECT,
    }),
  ]);

  const totalsByCampaign = new Map(grouped.map((row) => [row.campaignId, totalsFromSum(row._sum)]));

  return campaigns.map((campaign) => {
    const medido = totalsByCampaign.get(campaign.id);
    const totals = medido ?? ZERO_TOTALS;

    return {
      campaignId: campaign.id,
      externalId: campaign.externalId,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      hasData: medido !== undefined,
      totals,
      metrics: computeMetrics(totals),
    };
  });
}

// A ingestao roda com atraso, entao "hoje" e quase sempre mais tarde que o
// ultimo dia medido. Ancorar o periodo padrao aqui, e nao no calendario, e o que
// faz "7 dias" mostrar sete dias com dado em vez de tres barras e quatro buracos
// que o grafico corta depois.
export async function getAccountLastDataDate(accountId: string): Promise<string | null> {
  const { _max } = await getPrisma().dailyInsight.aggregate({
    where: { campaign: { adAccountId: accountId } },
    _max: { date: true },
  });

  return _max.date;
}

export async function getCampaignLastDataDate(campaignId: string): Promise<string | null> {
  const { _max } = await getPrisma().dailyInsight.aggregate({
    where: { campaignId },
    _max: { date: true },
  });

  return _max.date;
}

// O seletor de periodo vive no layout, que nao le searchParams e por isso nao
// sabe qual conta esta aberta: ele recebe a ancora de todas e escolhe a sua ja
// no cliente. Sem isso o botao "7d" calcularia um periodo diferente do que o
// servidor resolveu e nenhum preset apareceria como ativo.
//
// O groupBy varre a tabela inteira de insights, sem filtro de conta, e roda em
// toda navegacao do grupo (app). Aguenta a escala de hoje e nao aguenta a de
// sempre: passando da casa dos milhoes de linhas isto vira um MAX(date) por
// conta em SQL. Nao ja: $queryRaw aqui erra de schema sob o adaptador (o motivo
// esta em getDailySeries), e trocar corretude por velocidade que ainda nao falta
// e o pior dos dois lados.
export async function getLastDataDateByAccount(): Promise<Record<string, string>> {
  const prisma = getPrisma();
  const grouped = await prisma.dailyInsight.groupBy({
    by: ["campaignId"],
    _max: { date: true },
  });

  if (grouped.length === 0) {
    return {};
  }

  const campaigns = await prisma.campaign.findMany({
    where: { id: { in: grouped.map((row) => row.campaignId) } },
    select: { id: true, adAccountId: true },
  });
  const accountByCampaign = new Map(campaigns.map((campaign) => [campaign.id, campaign.adAccountId]));

  const lastByAccount: Record<string, string> = {};
  for (const row of grouped) {
    const accountId = accountByCampaign.get(row.campaignId);
    const date = row._max.date;
    if (accountId === undefined || date === null) {
      continue;
    }

    // YYYY-MM-DD ordena lexicograficamente na ordem do calendario, que e metade
    // do motivo de as datas de metrica serem string neste projeto.
    const atual = lastByAccount[accountId];
    if (atual === undefined || date > atual) {
      lastByAccount[accountId] = date;
    }
  }

  return lastByAccount;
}

// Mesma duracao do periodo atual, terminando no dia anterior ao inicio: e o
// "periodo anterior" que a comparacao do painel espera, nao os N dias corridos
// antes de hoje.
export function getPreviousPeriod(since: string, until: string): Period {
  assertPeriod(since, until);

  const periodLengthDays = daysBetween(since, until) + 1;
  if (periodLengthDays <= 0) {
    throw new RangeError(`Periodo invertido: "${since}" e depois de "${until}".`);
  }

  const previousUntil = addDays(since, -1);
  const previousSince = addDays(previousUntil, -(periodLengthDays - 1));

  return { since: previousSince, until: previousUntil };
}

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { DailyInsight } from "../src/generated/prisma/browser";
import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
  AlertStatus,
} from "../src/generated/prisma/enums";
import { backtestRule, type BacktestSeries } from "../src/lib/alerts/backtest";
import { fingerprintFor, type EvaluableRule } from "../src/lib/alerts/rules";
import { mergeSeries, type DayTotals } from "../src/lib/alerts/series";
import { DEMO_USER_EMAIL } from "../src/lib/auth/env";
import { addDays } from "../src/lib/dates";
import { DEFAULT_END_DATE, generateAccount } from "../src/lib/mock/generator";

// Mesma preferencia do prisma.config.ts (migrationUrl): upsert e createMany em
// lote nao deveriam passar pelo PgBouncer em modo transacao do Neon, que nao
// sobrevive a prepared statements. Local fica com DIRECT_URL vazio e cai em
// DATABASE_URL sozinho -- ver README para o comando de rodar contra producao.
function connectionString(): string {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DIRECT_URL ou DATABASE_URL precisa estar definida para rodar o seed.");
  }
  return url;
}

const DEMO_SEED = 1;

// Quantos dias de feed a conta demo tem. Curto o bastante para a tela de alertas
// caber numa leitura e longo o bastante para haver mais de um dia com disparo --
// e sobra historico atras dele (o gerador faz 120 dias) para as janelas de 30
// dias serem completas desde o primeiro dia simulado.
const DIAS_DE_ALERTA = 45;

// Meio-dia no fuso da conta gerada (America/Sao_Paulo). O feed agrupa pelo dia
// no fuso da conta de anuncios, entao carimbar meia-noite UTC jogaria metade dos
// alertas para o dia anterior na tela.
function instanteNoDia(date: string): Date {
  return new Date(`${date}T12:00:00-03:00`);
}

// Os insights ja estao em memoria, entao o backtest da demo nao le o banco: a
// mesma seed gera os mesmos dias, os mesmos disparos e as mesmas datas.
function seriesPorCampanha(insights: readonly DailyInsight[]): Map<string, DayTotals[]> {
  const porCampanha = new Map<string, DayTotals[]>();

  for (const insight of insights) {
    const dias = porCampanha.get(insight.campaignId) ?? [];
    dias.push({
      date: insight.date,
      hasData: true,
      impressions: insight.impressions,
      clicks: insight.clicks,
      spendCents: insight.spendCents,
      conversions: insight.conversions,
      conversionValueCents: insight.conversionValueCents,
      reach: insight.reach,
    });
    porCampanha.set(insight.campaignId, dias);
  }

  for (const dias of porCampanha.values()) {
    dias.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return porCampanha;
}

type AlertaDemo = {
  ruleId: string;
  campaignId: string | null;
  fingerprint: string;
  status: AlertStatus;
  triggeredAt: Date;
  resolvedAt: Date | null;
  context: object;
};

// Replay do motor sobre o historico sintetico. E o mesmo backtest que o
// formulario de regra mostra em preview: se a tela promete "teria disparado
// nestas datas", a conta demo tem que ser exatamente essas datas.
function alertasDaRegra(
  rule: EvaluableRule,
  porCampanha: ReadonlyMap<string, readonly DayTotals[]>,
  nomeDaCampanha: ReadonlyMap<string, string>,
  since: string,
  until: string,
): AlertaDemo[] {
  const series: BacktestSeries[] =
    rule.scope === AlertScope.ACCOUNT
      ? [{ target: null, days: mergeSeries([...porCampanha.values()]) }]
      : [...porCampanha.entries()].map(([campaignId, days]) => ({
          target: { campaignId, campaignName: nomeDaCampanha.get(campaignId) ?? campaignId },
          days,
        }));

  return backtestRule({ rule, series, since, until }).firings.map((firing) => ({
    ruleId: rule.id,
    campaignId: firing.target?.campaignId ?? null,
    fingerprint: fingerprintFor(rule.id, firing.target?.campaignId ?? null, rule.direction),
    status: firing.resolvedOn === null ? AlertStatus.OPEN : AlertStatus.RESOLVED,
    triggeredAt: instanteNoDia(firing.date),
    resolvedAt: firing.resolvedOn === null ? null : instanteNoDia(firing.resolvedOn),
    context: firing.context,
  }));
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString() }) });

  try {
    const demoUser = await prisma.user.upsert({
      where: { email: DEMO_USER_EMAIL },
      create: { email: DEMO_USER_EMAIL, name: "Conta demo", isDemo: true },
      update: { isDemo: true },
    });

    // generateAccount e deterministico (mulberry32 com seed fixo, sem
    // Date.now/Math.random): a mesma seed sempre devolve os mesmos ids de
    // conta/campanha/insight, o que e o que permite upsert/skipDuplicates
    // tornarem o seed idempotente.
    const { account, campaigns, insights } = generateAccount(DEMO_SEED, DEFAULT_END_DATE);

    const { id: accountId, ...accountData } = { ...account, userId: demoUser.id };
    await prisma.adAccount.upsert({
      where: { id: accountId },
      create: { id: accountId, ...accountData },
      update: accountData,
    });

    for (const campaign of campaigns) {
      const { id: campaignId, ...campaignData } = campaign;
      await prisma.campaign.upsert({
        where: { id: campaignId },
        create: { id: campaignId, ...campaignData },
        update: campaignData,
      });
    }

    // @@unique([campaignId, date]) e o que torna isto seguro rodar de novo:
    // skipDuplicates pula toda linha ja inserida em vez de dar erro de
    // constraint, sem precisar de 480 upserts individuais.
    await prisma.dailyInsight.createMany({ data: insights, skipDuplicates: true });

    const alertRules = [
      {
        // camp_leads degrada o CPA em 1.6x a partir do dia 95 (ver PROFILES em
        // src/lib/mock/generator.ts). Janela de 30 dias contra os 30 dias
        // anteriores pega ~25 dias degradados contra 30 limpos: o CPA sobe uns
        // 50%, bem acima do limiar de 30% -- e a regra que "dispara".
        name: "Custo por conversão subiu no mês",
        userId: demoUser.id,
        adAccountId: accountId,
        metric: AlertMetric.CPA,
        comparison: AlertComparison.PCT_CHANGE,
        direction: AlertDirection.ABOVE,
        scope: AlertScope.CAMPAIGN,
        threshold: 30 * 100,
        windowDays: 30,
      },
      {
        // Conta inteira. Nada no gerador cria essa queda: fica configurada, mas
        // nao dispara com o dado sintetico atual.
        name: "ROAS da conta caiu na semana",
        userId: demoUser.id,
        adAccountId: accountId,
        metric: AlertMetric.ROAS,
        comparison: AlertComparison.PCT_CHANGE,
        direction: AlertDirection.BELOW,
        scope: AlertScope.ACCOUNT,
        threshold: 20 * 100,
        windowDays: 7,
      },
      {
        name: "CTR das campanhas caiu na semana",
        userId: demoUser.id,
        adAccountId: accountId,
        metric: AlertMetric.CTR,
        comparison: AlertComparison.PCT_CHANGE,
        direction: AlertDirection.BELOW,
        scope: AlertScope.CAMPAIGN,
        threshold: 15 * 100,
        windowDays: 7,
      },
      {
        // A mesma degradacao de camp_leads vista com janela curta: dispara no
        // meio de julho e fecha nove dias depois, quando a media de 7 dias volta
        // ao patamar. E o alerta resolvido da conta demo.
        name: "Custo por conversão subiu na semana",
        userId: demoUser.id,
        adAccountId: accountId,
        metric: AlertMetric.CPA,
        comparison: AlertComparison.PCT_CHANGE,
        direction: AlertDirection.ABOVE,
        scope: AlertScope.CAMPAIGN,
        threshold: 20 * 100,
        windowDays: 7,
      },
      {
        // frequencyGrowth dos perfis faz a frequencia subir ao longo dos 120
        // dias: esta regra pega o momento em que uma campanha passa de 3,5
        // impressoes por pessoa e nao volta mais. E o alerta antigo e ainda
        // aberto, que a tela usa para mostrar o estado silenciado.
        name: "Frequência acima de 3,5 na quinzena",
        userId: demoUser.id,
        adAccountId: accountId,
        metric: AlertMetric.FREQUENCY,
        comparison: AlertComparison.ABSOLUTE_THRESHOLD,
        direction: AlertDirection.ABOVE,
        scope: AlertScope.CAMPAIGN,
        threshold: 350,
        windowDays: 14,
      },
      {
        // A unica de dinheiro em ABSOLUTE_THRESHOLD, para o dado de demonstracao
        // exercitar os dois eixos de comparacao. Limiar em centavos, como todo
        // dinheiro no projeto: R$ 60,00 de custo por conversao.
        name: "Custo por conversão acima de R$ 60",
        userId: demoUser.id,
        adAccountId: accountId,
        metric: AlertMetric.CPA,
        comparison: AlertComparison.ABSOLUTE_THRESHOLD,
        direction: AlertDirection.ABOVE,
        scope: AlertScope.CAMPAIGN,
        threshold: 6_000,
        windowDays: 7,
      },
    ];

    const regrasGravadas = [];
    for (const rule of alertRules) {
      regrasGravadas.push(
        await prisma.alertRule.upsert({
          where: { userId_name: { userId: rule.userId, name: rule.name } },
          create: rule,
          update: rule,
        }),
      );
    }

    const porCampanha = seriesPorCampanha(insights);
    const nomeDaCampanha = new Map(campaigns.map((campaign) => [campaign.id, campaign.name]));
    const alertas = regrasGravadas.flatMap((rule) =>
      alertasDaRegra(
        rule,
        porCampanha,
        nomeDaCampanha,
        addDays(DEFAULT_END_DATE, -(DIAS_DE_ALERTA - 1)),
        DEFAULT_END_DATE,
      ),
    );

    // Um aberto vira silenciado para a tela de alertas mostrar os tres estados.
    // O escolhido e o mais antigo: silenciar e o que se faz com o aviso que ja
    // foi visto e nao vai ser resolvido hoje.
    const abertos = alertas
      .filter((alerta) => alerta.status === AlertStatus.OPEN)
      .sort((a, b) => a.triggeredAt.getTime() - b.triggeredAt.getTime());
    if (abertos.length > 1) {
      abertos[0].status = AlertStatus.MUTED;
    }

    // Apagar e recriar, e nao upsert: o alerta nao tem chave natural estavel
    // (dois episodios da mesma condicao compartilham fingerprint), e o backtest
    // e deterministico -- rodar o seed de novo tem que devolver o mesmo feed, nao
    // uma segunda copia dele.
    await prisma.alert.deleteMany({ where: { rule: { adAccountId: accountId } } });
    await prisma.alert.createMany({ data: alertas });

    console.log(
      `Seed ok: usuario demo ${demoUser.email}, conta ${accountId}, ` +
        `${campaigns.length} campanhas, ${insights.length} insights, ` +
        `${alertRules.length} regras de alerta, ${alertas.length} alertas.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

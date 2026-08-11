import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { AlertComparison, AlertMetric } from "../src/generated/prisma/enums";
import { DEMO_USER_EMAIL } from "../src/lib/auth/env";
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

    const leadsCampaign = campaigns.find((c) => c.externalId === "camp_leads");
    const blackFridayCampaign = campaigns.find((c) => c.externalId === "camp_bf_conv");
    if (!leadsCampaign || !blackFridayCampaign) {
      throw new Error("generateAccount nao devolveu as campanhas esperadas pelo seed.");
    }

    const alertRules = [
      {
        // camp_leads degrada o CPA em 1.6x a partir do dia 95 (ver PROFILES em
        // src/lib/mock/generator.ts). Janela de 30 dias contra os 30 dias
        // anteriores pega ~25 dias degradados contra 30 limpos: media sobe
        // uns 50%, bem acima do limiar de 30% -- e a regra que "dispara".
        name: "Custo por lead subiu no mês",
        userId: demoUser.id,
        adAccountId: accountId,
        campaignId: leadsCampaign.id,
        metric: AlertMetric.CPA,
        comparison: AlertComparison.INCREASE_PCT,
        thresholdPct: 30,
        windowDays: 30,
      },
      {
        // Conta inteira (campaignId nulo). Nada no gerador cria essa queda:
        // fica configurada, mas nao dispara com o dado sintetico atual.
        name: "ROAS da conta caiu na semana",
        userId: demoUser.id,
        adAccountId: accountId,
        campaignId: null,
        metric: AlertMetric.ROAS,
        comparison: AlertComparison.DECREASE_PCT,
        thresholdPct: 20,
        windowDays: 7,
      },
      {
        name: "CTR da campanha de Black Friday caiu",
        userId: demoUser.id,
        adAccountId: accountId,
        campaignId: blackFridayCampaign.id,
        metric: AlertMetric.CTR,
        comparison: AlertComparison.DECREASE_PCT,
        thresholdPct: 15,
        windowDays: 7,
      },
    ];

    for (const rule of alertRules) {
      await prisma.alertRule.upsert({
        where: { userId_name: { userId: rule.userId, name: rule.name } },
        create: rule,
        update: rule,
      });
    }

    console.log(
      `Seed ok: usuario demo ${demoUser.email}, conta ${accountId}, ` +
        `${campaigns.length} campanhas, ${insights.length} insights, ${alertRules.length} regras de alerta.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

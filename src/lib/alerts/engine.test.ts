import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
  AlertStatus,
  CampaignObjective,
  CampaignStatus,
  Platform,
} from "@/generated/prisma/enums";
import { addDays } from "@/lib/dates";
import type { MetricTotals } from "@/lib/metrics/calc";
import { createTestDatabase, resetTables, type TestDatabase } from "@/test/db";

const wiring = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getPrisma: () => wiring.prisma }));

const { evaluateRules } = await import("./engine");

let db: TestDatabase;
let contador = 0;

const AS_OF = "2026-08-10";
const JANELA = 7;

// Sete dias a R$ 300,00 e 6 conversoes por dia: CPA de R$ 50,00 sobre 42
// conversoes, folgado acima do piso de 30 do mapa de metricas.
const DIA_CPA_50: MetricTotals = {
  impressions: 10_000,
  clicks: 200,
  spendCents: 30_000,
  conversions: 6,
  conversionValueCents: 90_000,
  reach: 8_000,
};

const DIA_CPA_25: MetricTotals = { ...DIA_CPA_50, spendCents: 15_000 };
const DIA_CPA_20: MetricTotals = { ...DIA_CPA_50, spendCents: 12_000 };

// Mesmo CPA de R$ 50,00, sobre 28 conversoes na janela: o numero e o mesmo e a
// evidencia nao e.
const DIA_CPA_50_SEM_VOLUME: MetricTotals = { ...DIA_CPA_50, spendCents: 20_000, conversions: 4 };

function dias(until: string, quantos: number): string[] {
  return Array.from({ length: quantos }, (_, i) => addDays(until, -(quantos - 1 - i)));
}

const JANELA_ATUAL = dias(AS_OF, JANELA);
const JANELA_ANTERIOR = dias(addDays(AS_OF, -JANELA), JANELA);

async function seedAccount(): Promise<{ userId: string; adAccountId: string }> {
  contador += 1;
  const user = await db.prisma.user.create({
    data: { email: `dono-${contador}@lojademo.com.br`, name: "Dono" },
  });
  const account = await db.prisma.adAccount.create({
    data: {
      userId: user.id,
      externalId: `act_10000005${contador}`,
      platform: Platform.META,
      name: "Loja Demo",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
    },
  });

  return { userId: user.id, adAccountId: account.id };
}

async function seedCampaign(adAccountId: string, externalId: string): Promise<string> {
  const campaign = await db.prisma.campaign.create({
    data: {
      adAccountId,
      externalId,
      name: externalId,
      objective: CampaignObjective.CONVERSIONS,
      status: CampaignStatus.ACTIVE,
    },
  });

  return campaign.id;
}

async function gravarInsights(
  campaignId: string,
  datas: string[],
  totals: MetricTotals,
): Promise<void> {
  await db.prisma.dailyInsight.deleteMany({ where: { campaignId, date: { in: datas } } });
  await db.prisma.dailyInsight.createMany({
    data: datas.map((date) => ({ campaignId, date, ...totals })),
  });
}

type RegraOverrides = Partial<{
  metric: AlertMetric;
  comparison: AlertComparison;
  direction: AlertDirection;
  scope: AlertScope;
  threshold: number;
  windowDays: number;
  enabled: boolean;
}>;

async function seedRegra(
  userId: string,
  adAccountId: string,
  overrides: RegraOverrides = {},
): Promise<string> {
  contador += 1;
  const rule = await db.prisma.alertRule.create({
    data: {
      userId,
      adAccountId,
      name: `Regra ${contador}`,
      metric: overrides.metric ?? AlertMetric.CPA,
      comparison: overrides.comparison ?? AlertComparison.ABSOLUTE_THRESHOLD,
      direction: overrides.direction ?? AlertDirection.ABOVE,
      scope: overrides.scope ?? AlertScope.ACCOUNT,
      threshold: overrides.threshold ?? 4_500,
      windowDays: overrides.windowDays ?? JANELA,
      enabled: overrides.enabled ?? true,
    },
  });

  return rule.id;
}

function alertas() {
  return db.prisma.alert.findMany({ orderBy: { id: "asc" } });
}

beforeAll(async () => {
  db = await createTestDatabase();
  wiring.prisma = db.prisma;
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await resetTables(db);
});

describe("evaluateRules: disparo", () => {
  it("abre alerta quando o CPA passa do limiar", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    const ruleId = await seedRegra(userId, adAccountId, { threshold: 4_500 });

    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toMatchObject({ evaluated: 1, opened: 1, resolved: 0, suppressed: 0 });

    const abertos = await alertas();
    expect(abertos).toHaveLength(1);
    expect(abertos[0]).toMatchObject({
      ruleId,
      campaignId: null,
      status: AlertStatus.OPEN,
      resolvedAt: null,
    });
  });

  // O `context` e o que a /alerts vai ler para explicar o alerta em portugues
  // sem reconsultar o DailyInsight: se ele nao guardar os numeros do disparo, a
  // explicacao teria que ser recalculada e podia divergir do que disparou.
  it("guarda no contexto os numeros que motivaram o disparo", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });

    await evaluateRules(adAccountId, AS_OF);

    const [alerta] = await alertas();
    expect(alerta.context).toMatchObject({
      metric: AlertMetric.CPA,
      comparison: AlertComparison.ABSOLUTE_THRESHOLD,
      direction: AlertDirection.ABOVE,
      scope: AlertScope.ACCOUNT,
      threshold: 4_500,
      windowDays: JANELA,
      current: {
        period: { since: JANELA_ATUAL[0], until: AS_OF },
        value: 5_000,
        totals: { conversions: 42, spendCents: 210_000 },
      },
      previous: {
        period: { since: JANELA_ANTERIOR[0], until: JANELA_ANTERIOR[JANELA - 1] },
        value: 2_500,
      },
      deltaPercent: 100,
    });
  });

  it("abre um alerta por campanha infratora quando o escopo e de campanha", async () => {
    const { userId, adAccountId } = await seedAccount();
    const cara = await seedCampaign(adAccountId, "camp_cara");
    const barata = await seedCampaign(adAccountId, "camp_barata");
    await gravarInsights(cara, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(cara, JANELA_ANTERIOR, DIA_CPA_25);
    await gravarInsights(barata, JANELA_ATUAL, DIA_CPA_20);
    await gravarInsights(barata, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { scope: AlertScope.CAMPAIGN, threshold: 4_500 });

    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toMatchObject({ evaluated: 2, opened: 1 });

    const abertos = await alertas();
    expect(abertos).toHaveLength(1);
    expect(abertos[0].campaignId).toBe(cara);
  });
});

describe("evaluateRules: nao duplicacao", () => {
  it("nao abre um segundo alerta para a mesma condicao em execucoes consecutivas", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });

    const primeira = await evaluateRules(adAccountId, AS_OF);
    const antes = await alertas();
    const segunda = await evaluateRules(adAccountId, AS_OF);
    const depois = await alertas();

    expect(primeira.opened).toBe(1);
    expect(segunda.opened).toBe(0);
    expect(depois).toHaveLength(1);
    // Mesma linha, e nao uma linha nova identica: o id preserva o
    // triggeredAt original, que e quando o problema comecou.
    expect(depois[0].id).toBe(antes[0].id);
    expect(depois[0].triggeredAt).toEqual(antes[0].triggeredAt);
  });
});

describe("evaluateRules: resolucao", () => {
  it("resolve o alerta quando a condicao deixa de valer", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });
    await evaluateRules(adAccountId, AS_OF);

    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_20);
    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toMatchObject({ opened: 0, resolved: 1 });

    const [alerta] = await alertas();
    expect(alerta.status).toBe(AlertStatus.RESOLVED);
    expect(alerta.resolvedAt).not.toBeNull();
  });

  // Duas avaliacoes simultaneas da mesma conta (retry do cron cruzando com uma
  // sincronizacao manual) leem "nenhum aberto" e inserem duas vezes -- o indice
  // de fingerprint nao e unico. Resolver por condicao, e nao por id, fecha as
  // duas: por id, a passada seguinte so enxergaria uma e a copia ficaria aberta
  // para sempre.
  it("resolve tambem a duplicata aberta para a mesma condicao", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });
    await evaluateRules(adAccountId, AS_OF);

    const [original] = await alertas();
    await db.prisma.alert.create({
      data: {
        ruleId: original.ruleId,
        campaignId: original.campaignId,
        fingerprint: original.fingerprint,
        context: original.context ?? {},
      },
    });

    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_20);
    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo.resolved).toBe(2);
    expect((await alertas()).map((alerta) => alerta.status)).toEqual([
      AlertStatus.RESOLVED,
      AlertStatus.RESOLVED,
    ]);
  });

  // Sem volume nao da para saber se a condicao caiu -- so que ninguem consegue
  // medir. Resolver aqui afirmaria uma melhora que nenhum numero sustenta.
  it("nao resolve quando a janela deixa de ser avaliavel", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });
    await evaluateRules(adAccountId, AS_OF);

    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50_SEM_VOLUME);
    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toMatchObject({ evaluated: 0, resolved: 0, suppressed: 1 });
    expect((await alertas())[0].status).toBe(AlertStatus.OPEN);
  });
});

describe("evaluateRules: supressao", () => {
  it("nao dispara com volume insuficiente na janela", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50_SEM_VOLUME);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });

    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toMatchObject({ evaluated: 0, opened: 0, suppressed: 1 });
    expect(await alertas()).toHaveLength(0);
  });
});

describe("evaluateRules: regra desabilitada", () => {
  it("nao avalia nem dispara", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500, enabled: false });

    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toMatchObject({ evaluated: 0, opened: 0, resolved: 0, suppressed: 0 });
    expect(await alertas()).toHaveLength(0);
  });

  it("deixa em paz o alerta que a regra ja tinha aberto", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    const ruleId = await seedRegra(userId, adAccountId, { threshold: 4_500 });
    await evaluateRules(adAccountId, AS_OF);

    await db.prisma.alertRule.update({ where: { id: ruleId }, data: { enabled: false } });
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_20);
    await evaluateRules(adAccountId, AS_OF);

    expect((await alertas())[0].status).toBe(AlertStatus.OPEN);
  });
});

describe("evaluateRules: alerta silenciado", () => {
  it("nao recria nem resolve o que foi silenciado", async () => {
    const { userId, adAccountId } = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads");
    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_50);
    await gravarInsights(campaignId, JANELA_ANTERIOR, DIA_CPA_25);
    await seedRegra(userId, adAccountId, { threshold: 4_500 });
    await evaluateRules(adAccountId, AS_OF);
    await db.prisma.alert.updateMany({ data: { status: AlertStatus.MUTED } });

    const comCondicao = await evaluateRules(adAccountId, AS_OF);
    expect(comCondicao.opened).toBe(0);
    expect(await alertas()).toHaveLength(1);

    await gravarInsights(campaignId, JANELA_ATUAL, DIA_CPA_20);
    const semCondicao = await evaluateRules(adAccountId, AS_OF);

    expect(semCondicao.resolved).toBe(0);
    expect((await alertas())[0].status).toBe(AlertStatus.MUTED);
  });
});

describe("evaluateRules: janela", () => {
  it("recusa asOf fora do formato YYYY-MM-DD", async () => {
    const { adAccountId } = await seedAccount();

    await expect(evaluateRules(adAccountId, "10/08/2026")).rejects.toThrow(RangeError);
  });

  it("nao consulta nada quando a conta nao tem regra habilitada", async () => {
    const { adAccountId } = await seedAccount();

    const resumo = await evaluateRules(adAccountId, AS_OF);

    expect(resumo).toEqual({ evaluated: 0, opened: 0, resolved: 0, suppressed: 0 });
  });
});

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
import type { AlertContext } from "@/lib/alerts/rules";
import { createTestDatabase, resetTables, type TestDatabase } from "@/test/db";

const wiring = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getPrisma: () => wiring.prisma }));

const {
  accountBelongsToUser,
  countOpenAlertsByRule,
  createAlertRule,
  deleteAlertRule,
  getAlertRule,
  listAlertFeed,
  listAlertRules,
  setAlertRuleEnabled,
  setAlertStatus,
  updateAlertRule,
} = await import("./alerts");

let db: TestDatabase;
let contador = 0;

type Cenario = {
  readonly userId: string;
  readonly accountId: string;
  readonly campaignId: string;
};

async function seedCenario(): Promise<Cenario> {
  contador += 1;
  const user = await db.prisma.user.create({
    data: { email: `dono-${contador}@lojademo.com.br`, name: "Dono" },
  });
  const account = await db.prisma.adAccount.create({
    data: {
      userId: user.id,
      externalId: `act_2000000${contador}`,
      platform: Platform.META,
      name: "Loja Demo",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
    },
  });
  const campaign = await db.prisma.campaign.create({
    data: {
      adAccountId: account.id,
      externalId: `camp_${contador}`,
      name: "Captação de Leads",
      objective: CampaignObjective.LEADS,
      status: CampaignStatus.ACTIVE,
    },
  });

  return { userId: user.id, accountId: account.id, campaignId: campaign.id };
}

const ENTRADA_DE_REGRA = {
  name: "Custo por conversão subiu no mês",
  metric: AlertMetric.CPA,
  comparison: AlertComparison.PCT_CHANGE,
  direction: AlertDirection.ABOVE,
  scope: AlertScope.CAMPAIGN,
  threshold: 3_000,
  windowDays: 30,
} as const;

const TOTAIS = {
  impressions: 100_000,
  clicks: 2_000,
  spendCents: 300_000,
  conversions: 100,
  conversionValueCents: 900_000,
  reach: 60_000,
};

function contexto(): AlertContext {
  return {
    metric: AlertMetric.CPA,
    comparison: AlertComparison.PCT_CHANGE,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.CAMPAIGN,
    threshold: 3_000,
    windowDays: 7,
    campaign: { campaignId: "camp_1", campaignName: "Captação de Leads" },
    current: { period: { since: "2026-07-30", until: "2026-08-05" }, value: 2_980, totals: TOTAIS },
    previous: { period: { since: "2026-07-23", until: "2026-07-29" }, value: 1_840, totals: TOTAIS },
    deltaPercent: 61.95,
  };
}

async function seedRegra(cenario: Cenario, nome = ENTRADA_DE_REGRA.name): Promise<string> {
  const rule = await db.prisma.alertRule.create({
    data: { ...ENTRADA_DE_REGRA, name: nome, userId: cenario.userId, adAccountId: cenario.accountId },
  });
  return rule.id;
}

async function seedAlerta(
  ruleId: string,
  overrides: {
    status?: AlertStatus;
    triggeredAt?: string;
    resolvedAt?: string;
    campaignId?: string;
    context?: unknown;
  } = {},
): Promise<string> {
  contador += 1;
  const alert = await db.prisma.alert.create({
    data: {
      ruleId,
      campaignId: overrides.campaignId ?? null,
      fingerprint: `fp_${contador}`,
      status: overrides.status ?? AlertStatus.OPEN,
      triggeredAt: new Date(overrides.triggeredAt ?? "2026-08-05T12:00:00Z"),
      resolvedAt: overrides.resolvedAt === undefined ? null : new Date(overrides.resolvedAt),
      context: (overrides.context ?? contexto()) as never,
    },
  });
  return alert.id;
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

describe("listAlertFeed", () => {
  it("traz regra e campanha junto do alerta", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);
    await seedAlerta(ruleId, { campaignId: cenario.campaignId });

    const [alerta] = await listAlertFeed(cenario.accountId);

    expect(alerta.ruleName).toBe(ENTRADA_DE_REGRA.name);
    expect(alerta.campaignName).toBe("Captação de Leads");
    expect(alerta.context?.current.value).toBe(2_980);
  });

  it("devolve o mais recente primeiro", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);
    await seedAlerta(ruleId, { triggeredAt: "2026-08-01T12:00:00Z" });
    await seedAlerta(ruleId, { triggeredAt: "2026-08-05T12:00:00Z" });

    const feed = await listAlertFeed(cenario.accountId);

    expect(feed[0].triggeredAt.getTime()).toBeGreaterThan(feed[1].triggeredAt.getTime());
  });

  // Context que nao passa pela validacao nao apaga o alerta da lista: existe um
  // disparo, e some-lo esconderia um problema real so porque o Json envelheceu.
  it("mantem o alerta com context ilegivel, so sem os numeros", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);
    await seedAlerta(ruleId, { context: { metric: "CPX" } });

    const [alerta] = await listAlertFeed(cenario.accountId);

    expect(alerta.id).toBeDefined();
    expect(alerta.context).toBeNull();
  });

  it("nao mistura alerta de outra conta", async () => {
    const meu = await seedCenario();
    const alheio = await seedCenario();
    await seedAlerta(await seedRegra(meu));
    await seedAlerta(await seedRegra(alheio));

    expect(await listAlertFeed(meu.accountId)).toHaveLength(1);
  });
});

describe("countOpenAlertsByRule", () => {
  // Silenciado conta junto do aberto: os dois sao problema que continua
  // acontecendo, e a lista de regras esta dizendo o que a regra esta produzindo.
  it("conta aberto e silenciado, e nao resolvido", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);
    await seedAlerta(ruleId, { status: AlertStatus.OPEN });
    await seedAlerta(ruleId, { status: AlertStatus.MUTED });
    await seedAlerta(ruleId, { status: AlertStatus.RESOLVED, resolvedAt: "2026-08-06T12:00:00Z" });

    expect(await countOpenAlertsByRule(cenario.accountId)).toEqual({ [ruleId]: 2 });
  });

  it("omite a regra sem alerta aberto", async () => {
    const cenario = await seedCenario();
    await seedRegra(cenario);

    expect(await countOpenAlertsByRule(cenario.accountId)).toEqual({});
  });
});

describe("setAlertStatus", () => {
  it("silencia sem carimbar data de resolucao", async () => {
    const cenario = await seedCenario();
    const alertId = await seedAlerta(await seedRegra(cenario));

    expect(await setAlertStatus(alertId, cenario.userId, AlertStatus.MUTED)).toBe(true);

    const alerta = await db.prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alerta.status).toBe(AlertStatus.MUTED);
    expect(alerta.resolvedAt).toBeNull();
  });

  it("resolve carimbando a data", async () => {
    const cenario = await seedCenario();
    const alertId = await seedAlerta(await seedRegra(cenario));

    expect(await setAlertStatus(alertId, cenario.userId, AlertStatus.RESOLVED)).toBe(true);

    const alerta = await db.prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alerta.resolvedAt).not.toBeNull();
  });

  // A guarda que importa: o id do alerta viaja pela server action e e editavel
  // por quem chama. Sem o userId no where, qualquer sessao fecharia alerta de
  // qualquer conta.
  it("recusa alerta de outro dono", async () => {
    const meu = await seedCenario();
    const alheio = await seedCenario();
    const alertId = await seedAlerta(await seedRegra(alheio));

    expect(await setAlertStatus(alertId, meu.userId, AlertStatus.RESOLVED)).toBe(false);
    const alerta = await db.prisma.alert.findUniqueOrThrow({ where: { id: alertId } });
    expect(alerta.status).toBe(AlertStatus.OPEN);
  });

  it("recusa alerta que ja saiu de aberto", async () => {
    const cenario = await seedCenario();
    const alertId = await seedAlerta(await seedRegra(cenario), {
      status: AlertStatus.RESOLVED,
      resolvedAt: "2026-08-06T12:00:00Z",
    });

    expect(await setAlertStatus(alertId, cenario.userId, AlertStatus.MUTED)).toBe(false);
  });
});

describe("regras", () => {
  it("cria e lista a regra da conta", async () => {
    const cenario = await seedCenario();
    const criada = await createAlertRule(cenario.userId, cenario.accountId, ENTRADA_DE_REGRA);

    expect(criada.ok).toBe(true);
    expect(await listAlertRules(cenario.accountId)).toEqual([
      { ...ENTRADA_DE_REGRA, id: criada.ok ? criada.id : "", enabled: true },
    ]);
  });

  // @@unique([userId, name]) vira erro de dominio, e nao excecao: nome repetido
  // e decisao do usuario, e o formulario mostra a mensagem no campo.
  it("devolve nome duplicado como valor, sem lancar", async () => {
    const cenario = await seedCenario();
    await createAlertRule(cenario.userId, cenario.accountId, ENTRADA_DE_REGRA);

    expect(await createAlertRule(cenario.userId, cenario.accountId, ENTRADA_DE_REGRA)).toEqual({
      ok: false,
      code: "NOME_DUPLICADO",
    });
  });

  it("edita a propria regra", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);

    const resultado = await updateAlertRule(ruleId, cenario.userId, {
      ...ENTRADA_DE_REGRA,
      threshold: 5_000,
    });

    expect(resultado).toEqual({ ok: true, id: ruleId });
    expect((await getAlertRule(ruleId, cenario.userId))?.threshold).toBe(5_000);
  });

  it("recusa editar regra de outro dono", async () => {
    const meu = await seedCenario();
    const alheio = await seedCenario();
    const ruleId = await seedRegra(alheio);

    expect(await updateAlertRule(ruleId, meu.userId, { ...ENTRADA_DE_REGRA, threshold: 1 })).toEqual({
      ok: false,
      code: "NAO_ENCONTRADA",
    });
    expect(await getAlertRule(ruleId, meu.userId)).toBeNull();
  });

  it("pausa e reativa a regra", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);

    expect(await setAlertRuleEnabled(ruleId, cenario.userId, false)).toBe(true);
    expect((await getAlertRule(ruleId, cenario.userId))?.enabled).toBe(false);
  });

  it("recusa pausar regra de outro dono", async () => {
    const meu = await seedCenario();
    const ruleId = await seedRegra(await seedCenario());

    expect(await setAlertRuleEnabled(ruleId, meu.userId, false)).toBe(false);
  });

  // O onDelete: Cascade do schema leva os alertas junto: sem a regra, o alerta
  // nao tem como se explicar na tela.
  it("apaga a regra e os alertas dela", async () => {
    const cenario = await seedCenario();
    const ruleId = await seedRegra(cenario);
    await seedAlerta(ruleId);

    expect(await deleteAlertRule(ruleId, cenario.userId)).toBe(true);
    expect(await db.prisma.alert.count()).toBe(0);
  });

  it("recusa apagar regra de outro dono", async () => {
    const meu = await seedCenario();
    const ruleId = await seedRegra(await seedCenario());

    expect(await deleteAlertRule(ruleId, meu.userId)).toBe(false);
    expect(await db.prisma.alertRule.count({ where: { id: ruleId } })).toBe(1);
  });
});

describe("accountBelongsToUser", () => {
  it("confirma a conta do proprio dono", async () => {
    const cenario = await seedCenario();
    expect(await accountBelongsToUser(cenario.accountId, cenario.userId)).toBe(true);
  });

  // O adAccountId chega do formulario, que e editavel: sem esta confirmacao
  // daria para pendurar uma regra na conta de outra pessoa.
  it("recusa a conta de outro dono", async () => {
    const meu = await seedCenario();
    const alheio = await seedCenario();

    expect(await accountBelongsToUser(alheio.accountId, meu.userId)).toBe(false);
  });
});

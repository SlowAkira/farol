import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignObjective, CampaignStatus, Platform } from "@/generated/prisma/enums";
import { computeMetrics } from "@/lib/metrics/calc";
import { createTestDatabase, resetTables, type TestDatabase } from "@/test/db";

const wiring = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getPrisma: () => wiring.prisma }));

const { getCampaignDetail } = await import("./campaigns");

let db: TestDatabase;
let accountCounter = 0;

async function seedAccount(): Promise<string> {
  accountCounter += 1;
  const user = await db.prisma.user.create({
    data: { email: `dono-${accountCounter}@lojademo.com.br`, name: "Dono" },
  });

  const account = await db.prisma.adAccount.create({
    data: {
      userId: user.id,
      externalId: `act_20000004${accountCounter}`,
      platform: Platform.META,
      name: "Loja Demo",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
    },
  });

  return account.id;
}

async function seedCampaign(adAccountId: string): Promise<string> {
  const campaign = await db.prisma.campaign.create({
    data: {
      adAccountId,
      externalId: "camp_1",
      name: "Remarketing Black Friday",
      objective: CampaignObjective.CONVERSIONS,
      status: CampaignStatus.ACTIVE,
      dailyBudgetCents: 50_000,
    },
  });

  return campaign.id;
}

async function seedInsight(campaignId: string, date: string, spendCents: number): Promise<void> {
  await db.prisma.dailyInsight.create({
    data: {
      campaignId,
      date,
      impressions: 1_000,
      clicks: 50,
      spendCents,
      conversions: 5,
      conversionValueCents: spendCents * 4,
      reach: 800,
    },
  });
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

describe("getCampaignDetail", () => {
  it("soma so os dias dentro do periodo e devolve as metricas derivadas", async () => {
    const accountId = await seedAccount();
    const campaignId = await seedCampaign(accountId);

    await seedInsight(campaignId, "2026-07-31", 99_900);
    await seedInsight(campaignId, "2026-08-01", 10_000);
    await seedInsight(campaignId, "2026-08-02", 20_000);
    await seedInsight(campaignId, "2026-08-03", 99_900);

    const detail = await getCampaignDetail(campaignId, "2026-08-01", "2026-08-02");

    expect(detail?.name).toBe("Remarketing Black Friday");
    expect(detail?.dailyBudgetCents).toBe(50_000);
    expect(detail?.totals).toEqual({
      impressions: 2_000,
      clicks: 100,
      spendCents: 30_000,
      conversions: 10,
      conversionValueCents: 120_000,
      reach: 1_600,
    });
    expect(detail?.metrics).toEqual(computeMetrics(detail!.totals));
  });

  it("traz a moeda da conta junto, que e o que formata o valor em centavos", async () => {
    const accountId = await seedAccount();
    const campaignId = await seedCampaign(accountId);

    const detail = await getCampaignDetail(campaignId, "2026-08-01", "2026-08-02");

    expect(detail?.account).toEqual({ id: accountId, name: "Loja Demo", currency: "BRL" });
  });

  // Periodo sem insight nenhum ainda e uma campanha que existe: a pagina mostra
  // a campanha zerada, nao um 404.
  it("devolve a campanha com totais zerados quando o periodo nao tem insight", async () => {
    const accountId = await seedAccount();
    const campaignId = await seedCampaign(accountId);

    await seedInsight(campaignId, "2026-07-01", 10_000);

    const detail = await getCampaignDetail(campaignId, "2026-08-01", "2026-08-02");

    expect(detail?.totals.spendCents).toBe(0);
    expect(detail?.metrics.roasRatio).toBeNull();
  });

  it("devolve null para campanha inexistente, sem lancar", async () => {
    await expect(getCampaignDetail("nao-existe", "2026-08-01", "2026-08-02")).resolves.toBeNull();
  });

  it("recusa periodo mal formado", async () => {
    await expect(getCampaignDetail("qualquer", "01/08/2026", "2026-08-02")).rejects.toThrow(
      RangeError,
    );
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignObjective, CampaignStatus, Platform } from "@/generated/prisma/enums";
import { computeMetrics, sumTotals, type MetricTotals } from "@/lib/metrics/calc";
import { createTestDatabase, resetTables, type TestDatabase } from "@/test/db";

const wiring = vi.hoisted(() => ({ prisma: null as unknown }));
vi.mock("@/lib/db/client", () => ({ getPrisma: () => wiring.prisma }));

const {
  getAccountLastDataDate,
  getAccountTotals,
  getCampaignBreakdown,
  getCampaignDailySeries,
  getCampaignLastDataDate,
  getCampaignTable,
  getDailySeries,
  getLastDataDateByAccount,
  getPreviousPeriod,
} = await import("./insights");
type DailyTotals = Awaited<ReturnType<typeof getDailySeries>>[number];

let db: TestDatabase;

// Contador em vez de e-mail fixo: alguns testes seedam duas contas (para
// provar isolamento entre contas) e User.email e unico.
let accountCounter = 0;

async function seedAccount(): Promise<string> {
  accountCounter += 1;
  const user = await db.prisma.user.create({
    data: { email: `dono-${accountCounter}@lojademo.com.br`, name: "Dono" },
  });

  const account = await db.prisma.adAccount.create({
    data: {
      userId: user.id,
      externalId: `act_10000004${accountCounter}`,
      platform: Platform.META,
      name: "Loja Demo",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
    },
  });

  return account.id;
}

async function seedCampaign(
  adAccountId: string,
  externalId: string,
  overrides: { name?: string; objective?: CampaignObjective; status?: CampaignStatus } = {},
): Promise<string> {
  const campaign = await db.prisma.campaign.create({
    data: {
      adAccountId,
      externalId,
      name: overrides.name ?? externalId,
      objective: overrides.objective ?? CampaignObjective.CONVERSIONS,
      status: overrides.status ?? CampaignStatus.ACTIVE,
    },
  });

  return campaign.id;
}

type InsightRow = MetricTotals & { readonly campaignId: string; readonly date: string };

// Valores variam por indice em vez de repetir a mesma linha: uma soma que
// bate por coincidencia com todo mundo igual a 1 nao prova que a agregacao
// soma de verdade em vez de, por exemplo, so multiplicar pela contagem.
function insightRows(campaignIds: string[], dates: string[]): InsightRow[] {
  const rows: InsightRow[] = [];
  let i = 0;
  for (const campaignId of campaignIds) {
    for (const date of dates) {
      i += 1;
      const spendCents = 5_000 + i * 123;
      rows.push({
        campaignId,
        date,
        impressions: 1_000 + i * 37,
        clicks: 20 + (i % 15),
        spendCents,
        conversions: i % 6,
        conversionValueCents: spendCents * 3,
        reach: 800 + i * 19,
      });
    }
  }
  return rows;
}

function totalsOf(day: DailyTotals): MetricTotals {
  return {
    impressions: day.impressions,
    clicks: day.clicks,
    spendCents: day.spendCents,
    conversions: day.conversions,
    conversionValueCents: day.conversionValueCents,
    reach: day.reach,
  };
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

describe("getAccountTotals", () => {
  it("soma os totais da conta igual a uma soma feita em JavaScript sobre as mesmas linhas", async () => {
    const adAccountId = await seedAccount();
    const campaignA = await seedCampaign(adAccountId, "camp_a");
    const campaignB = await seedCampaign(adAccountId, "camp_b");
    const dates = ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"];

    const rows = insightRows([campaignA, campaignB], dates);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const totals = await getAccountTotals(adAccountId, "2026-06-01", "2026-06-05");

    expect(totals).toEqual(sumTotals(rows));
  });

  it("ignora insight fora do periodo e de outra conta", async () => {
    const adAccountId = await seedAccount();
    const campaign = await seedCampaign(adAccountId, "camp_a");
    const outroAdAccountId = await seedAccount();
    const outraCampanha = await seedCampaign(outroAdAccountId, "camp_outra_conta");

    const dentro = insightRows([campaign], ["2026-06-03"]);
    const foraDoPeriodo = insightRows([campaign], ["2026-07-01"]);
    const deOutraConta = insightRows([outraCampanha], ["2026-06-03"]);
    await db.prisma.dailyInsight.createMany({ data: [...dentro, ...foraDoPeriodo, ...deOutraConta] });

    const totals = await getAccountTotals(adAccountId, "2026-06-01", "2026-06-05");

    expect(totals).toEqual(sumTotals(dentro));
  });

  it("inclui insight exatamente na borda do periodo", async () => {
    const adAccountId = await seedAccount();
    const campaign = await seedCampaign(adAccountId, "camp_a");
    const rows = insightRows([campaign], ["2026-06-01", "2026-06-05"]);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const totals = await getAccountTotals(adAccountId, "2026-06-01", "2026-06-05");

    expect(totals).toEqual(sumTotals(rows));
  });

  it("devolve zero, nunca null, quando a conta nao tem insight no periodo", async () => {
    const adAccountId = await seedAccount();

    const totals = await getAccountTotals(adAccountId, "2026-06-01", "2026-06-05");

    expect(totals).toEqual({
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      conversionValueCents: 0,
      reach: 0,
    });
  });

  it("derruba com data fora do formato YYYY-MM-DD", async () => {
    const adAccountId = await seedAccount();

    await expect(getAccountTotals(adAccountId, "01/06/2026", "2026-06-05")).rejects.toThrow(
      RangeError,
    );
  });
});

describe("getDailySeries", () => {
  it("bate, dia a dia, com a soma feita em JavaScript agrupada por data", async () => {
    const adAccountId = await seedAccount();
    const campaignA = await seedCampaign(adAccountId, "camp_a");
    const campaignB = await seedCampaign(adAccountId, "camp_b");
    const dates = ["2026-06-01", "2026-06-02", "2026-06-03"];

    const rows = insightRows([campaignA, campaignB], dates);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const series = await getDailySeries(adAccountId, "2026-06-01", "2026-06-03");

    expect(series.map((day) => day.date)).toEqual(dates);
    for (const day of series) {
      const rowsDoDia = rows.filter((row) => row.date === day.date);
      expect(totalsOf(day)).toEqual(sumTotals(rowsDoDia));
    }
  });

  // O grafico de evolucao precisa de um ponto por dia, mesmo sem ingestao
  // naquele dia; sem o generate_series o dia sem insight simplesmente sumiria.
  it("preenche com zero o dia sem nenhum insight, sem pular esse dia da serie", async () => {
    const adAccountId = await seedAccount();
    const campaign = await seedCampaign(adAccountId, "camp_a");
    const rows = insightRows([campaign], ["2026-06-01", "2026-06-03", "2026-06-05"]);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const series = await getDailySeries(adAccountId, "2026-06-01", "2026-06-05");

    expect(series.map((day) => day.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
      "2026-06-04",
      "2026-06-05",
    ]);

    // hasData: false e o que separa este zero do zero de um dia que rodou e nao
    // gastou. Sem essa marca os dois seriam indistinguiveis para quem plota.
    const diaVazio = series.find((day) => day.date === "2026-06-02");
    expect(diaVazio).toEqual({
      date: "2026-06-02",
      hasData: false,
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      conversionValueCents: 0,
      reach: 0,
    });

    const diaComDado = series.find((day) => day.date === "2026-06-01");
    expect(diaComDado?.hasData).toBe(true);
    expect(totalsOf(diaComDado!)).toEqual(sumTotals(rows.filter((row) => row.date === "2026-06-01")));
  });

  // O caso que os totais sozinhos nao contam: a campanha rodou, foi medida e o
  // resultado do dia foi zero. Isso e dado, nao lacuna, e tem que sobreviver ao
  // corte que o grafico faz nos dias sem insight.
  it("marca como dado o dia cujo insight existe mas soma zero", async () => {
    const adAccountId = await seedAccount();
    const campaign = await seedCampaign(adAccountId, "camp_a");
    await db.prisma.dailyInsight.create({
      data: {
        campaignId: campaign,
        date: "2026-06-02",
        impressions: 0,
        clicks: 0,
        spendCents: 0,
        conversions: 0,
        conversionValueCents: 0,
        reach: 0,
      },
    });

    const series = await getDailySeries(adAccountId, "2026-06-01", "2026-06-03");

    expect(series.map((day) => [day.date, day.hasData])).toEqual([
      ["2026-06-01", false],
      ["2026-06-02", true],
      ["2026-06-03", false],
    ]);
    expect(series[1].spendCents).toBe(0);
  });

  it("nao soma insight de outra conta no dia", async () => {
    const adAccountId = await seedAccount();
    const campaign = await seedCampaign(adAccountId, "camp_a");
    const outroAdAccountId = await seedAccount();
    const outraCampanha = await seedCampaign(outroAdAccountId, "camp_outra_conta");

    const meu = insightRows([campaign], ["2026-06-01"]);
    const deOutraConta = insightRows([outraCampanha], ["2026-06-01"]);
    await db.prisma.dailyInsight.createMany({ data: [...meu, ...deOutraConta] });

    const series = await getDailySeries(adAccountId, "2026-06-01", "2026-06-01");

    expect(totalsOf(series[0])).toEqual(sumTotals(meu));
  });
});

describe("getCampaignTable", () => {
  // A diferenca inteira para getCampaignBreakdown esta aqui: la a campanha sem
  // insight no periodo sai da lista, aqui ela fica, marcada.
  it("inclui campanha sem insight no periodo, marcada como sem dado", async () => {
    const adAccountId = await seedAccount();
    const comDado = await seedCampaign(adAccountId, "camp_a", { name: "Com dado" });
    await seedCampaign(adAccountId, "camp_b", { name: "Sem dado" });

    await db.prisma.dailyInsight.createMany({ data: insightRows([comDado], ["2026-06-02"]) });

    const linhas = await getCampaignTable(adAccountId, "2026-06-01", "2026-06-05");
    const porNome = new Map(linhas.map((linha) => [linha.name, linha]));

    expect(linhas).toHaveLength(2);
    expect(porNome.get("Com dado")?.hasData).toBe(true);
    expect(porNome.get("Sem dado")?.hasData).toBe(false);
    expect(porNome.get("Sem dado")?.totals).toEqual(sumTotals([]));
  });

  it("soma so o periodo pedido, e nao a vida toda da campanha", async () => {
    const adAccountId = await seedAccount();
    const campaign = await seedCampaign(adAccountId, "camp_a");

    const dentro = insightRows([campaign], ["2026-06-02", "2026-06-03"]);
    const fora = insightRows([campaign], ["2026-07-01"]);
    await db.prisma.dailyInsight.createMany({ data: [...dentro, ...fora] });

    const [linha] = await getCampaignTable(adAccountId, "2026-06-01", "2026-06-05");

    expect(linha.totals).toEqual(sumTotals(dentro));
    expect(linha.metrics).toEqual(computeMetrics(sumTotals(dentro)));
  });

  it("nao traz campanha de outra conta", async () => {
    const adAccountId = await seedAccount();
    await seedCampaign(adAccountId, "camp_a", { name: "Minha" });
    const outraConta = await seedAccount();
    await seedCampaign(outraConta, "camp_b", { name: "Da outra" });

    const linhas = await getCampaignTable(adAccountId, "2026-06-01", "2026-06-05");

    expect(linhas.map((linha) => linha.name)).toEqual(["Minha"]);
  });

  it("devolve lista vazia quando a conta nao tem campanha", async () => {
    const adAccountId = await seedAccount();

    expect(await getCampaignTable(adAccountId, "2026-06-01", "2026-06-05")).toEqual([]);
  });

  it("derruba com data fora do formato YYYY-MM-DD", async () => {
    const adAccountId = await seedAccount();

    await expect(getCampaignTable(adAccountId, "01/06/2026", "2026-06-05")).rejects.toThrow(
      RangeError,
    );
  });
});

describe("ultimo dia com dado", () => {
  it("devolve o dia mais recente da conta, e nao o da campanha mais recente", async () => {
    const adAccountId = await seedAccount();
    const campaignA = await seedCampaign(adAccountId, "camp_a");
    const campaignB = await seedCampaign(adAccountId, "camp_b");

    await db.prisma.dailyInsight.createMany({
      data: [
        ...insightRows([campaignA], ["2026-06-01", "2026-06-09"]),
        ...insightRows([campaignB], ["2026-06-04"]),
      ],
    });

    expect(await getAccountLastDataDate(adAccountId)).toBe("2026-06-09");
    expect(await getCampaignLastDataDate(campaignB)).toBe("2026-06-04");
  });

  it("devolve null quando a conta ainda nao tem insight nenhum", async () => {
    const adAccountId = await seedAccount();
    await seedCampaign(adAccountId, "camp_a");

    expect(await getAccountLastDataDate(adAccountId)).toBeNull();
    expect(await getLastDataDateByAccount()).toEqual({});
  });

  it("nao deixa o dia de uma conta vazar para outra", async () => {
    const minhaConta = await seedAccount();
    const minhaCampanha = await seedCampaign(minhaConta, "camp_a");
    const outraConta = await seedAccount();
    const outraCampanha = await seedCampaign(outraConta, "camp_b");

    await db.prisma.dailyInsight.createMany({
      data: [
        ...insightRows([minhaCampanha], ["2026-06-02"]),
        ...insightRows([outraCampanha], ["2026-06-20"]),
      ],
    });

    expect(await getAccountLastDataDate(minhaConta)).toBe("2026-06-02");
    expect(await getLastDataDateByAccount()).toEqual({
      [minhaConta]: "2026-06-02",
      [outraConta]: "2026-06-20",
    });
  });

  // O mapa reduz por conta em JavaScript sobre um groupBy por campanha, e e ai
  // que um maximo por campanha pode ser confundido com o maximo da conta.
  it("reduz para o maior dia entre as campanhas da mesma conta", async () => {
    const adAccountId = await seedAccount();
    const campaignA = await seedCampaign(adAccountId, "camp_a");
    const campaignB = await seedCampaign(adAccountId, "camp_b");
    const campaignC = await seedCampaign(adAccountId, "camp_c");

    await db.prisma.dailyInsight.createMany({
      data: [
        ...insightRows([campaignA], ["2026-06-11"]),
        ...insightRows([campaignB], ["2026-06-30"]),
        ...insightRows([campaignC], ["2026-06-07"]),
      ],
    });

    expect(await getLastDataDateByAccount()).toEqual({ [adAccountId]: "2026-06-30" });
  });
});

describe("getCampaignBreakdown", () => {
  it("soma por campanha igual a uma soma feita em JavaScript e ja calcula as metricas", async () => {
    const adAccountId = await seedAccount();
    const campaignA = await seedCampaign(adAccountId, "camp_a", { name: "Campanha A" });
    const campaignB = await seedCampaign(adAccountId, "camp_b", { name: "Campanha B" });
    const dates = ["2026-06-01", "2026-06-02", "2026-06-03"];

    const rows = insightRows([campaignA, campaignB], dates);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const breakdown = await getCampaignBreakdown(adAccountId, "2026-06-01", "2026-06-03");

    expect(breakdown).toHaveLength(2);
    for (const entry of breakdown) {
      const rowsDaCampanha = rows.filter((row) => row.campaignId === entry.campaignId);
      const totaisEsperados = sumTotals(rowsDaCampanha);

      expect(entry.totals).toEqual(totaisEsperados);
      expect(entry.metrics).toEqual(computeMetrics(totaisEsperados));
    }
  });

  it("ordena por gasto do maior para o menor", async () => {
    const adAccountId = await seedAccount();
    const barato = await seedCampaign(adAccountId, "camp_barato");
    const caro = await seedCampaign(adAccountId, "camp_caro");

    await db.prisma.dailyInsight.createMany({
      data: [
        { campaignId: barato, date: "2026-06-01", impressions: 100, clicks: 5, spendCents: 1_000, conversions: 1, conversionValueCents: 2_000, reach: 90 },
        { campaignId: caro, date: "2026-06-01", impressions: 100, clicks: 5, spendCents: 9_000, conversions: 1, conversionValueCents: 2_000, reach: 90 },
      ],
    });

    const breakdown = await getCampaignBreakdown(adAccountId, "2026-06-01", "2026-06-01");

    expect(breakdown.map((entry) => entry.campaignId)).toEqual([caro, barato]);
  });

  it("deixa de fora campanha sem insight no periodo, mesmo com insight fora dele", async () => {
    const adAccountId = await seedAccount();
    const comDado = await seedCampaign(adAccountId, "camp_com_dado");
    const semDadoNoPeriodo = await seedCampaign(adAccountId, "camp_sem_dado_no_periodo");
    const semInsightNenhum = await seedCampaign(adAccountId, "camp_sem_insight");

    await db.prisma.dailyInsight.createMany({
      data: [
        ...insightRows([comDado], ["2026-06-01"]),
        ...insightRows([semDadoNoPeriodo], ["2026-07-01"]),
      ],
    });

    const breakdown = await getCampaignBreakdown(adAccountId, "2026-06-01", "2026-06-05");

    expect(breakdown.map((entry) => entry.campaignId)).toEqual([comDado]);
    expect(breakdown.map((entry) => entry.campaignId)).not.toContain(semInsightNenhum);
  });

  it("traz nome, objetivo e status da campanha", async () => {
    const adAccountId = await seedAccount();
    const campaignId = await seedCampaign(adAccountId, "camp_leads", {
      name: "Captacao de Leads",
      objective: CampaignObjective.LEADS,
      status: CampaignStatus.PAUSED,
    });
    await db.prisma.dailyInsight.createMany({ data: insightRows([campaignId], ["2026-06-01"]) });

    const [entry] = await getCampaignBreakdown(adAccountId, "2026-06-01", "2026-06-01");

    expect(entry).toMatchObject({
      campaignId,
      externalId: "camp_leads",
      name: "Captacao de Leads",
      objective: CampaignObjective.LEADS,
      status: CampaignStatus.PAUSED,
    });
  });
});

describe("getPreviousPeriod", () => {
  it("devolve um periodo de mesma duracao terminando no dia anterior ao inicio", () => {
    expect(getPreviousPeriod("2026-07-01", "2026-07-07")).toEqual({
      since: "2026-06-24",
      until: "2026-06-30",
    });
  });

  it("cobre periodo de um dia so", () => {
    expect(getPreviousPeriod("2026-07-01", "2026-07-01")).toEqual({
      since: "2026-06-30",
      until: "2026-06-30",
    });
  });

  it("atravessa virada de mes e de ano", () => {
    expect(getPreviousPeriod("2026-01-01", "2026-01-05")).toEqual({
      since: "2025-12-27",
      until: "2025-12-31",
    });
  });

  it("derruba com data fora do formato YYYY-MM-DD", () => {
    expect(() => getPreviousPeriod("2026-07-32", "2026-07-07")).toThrow(RangeError);
  });

  it("derruba com periodo invertido", () => {
    expect(() => getPreviousPeriod("2026-07-07", "2026-07-01")).toThrow(RangeError);
  });
});

describe("getCampaignDailySeries", () => {
  it("devolve uma serie zero-filled por campanha", async () => {
    const accountId = await seedAccount();
    const campanhaA = await seedCampaign(accountId, "camp_a", { name: "A" });
    const campanhaB = await seedCampaign(accountId, "camp_b", { name: "B" });
    const rows = insightRows([campanhaA, campanhaB], ["2026-06-01", "2026-06-03"]);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const series = await getCampaignDailySeries(accountId, "2026-06-01", "2026-06-03");
    const porNome = new Map(series.map((serie) => [serie.name, serie]));

    expect(series).toHaveLength(2);
    // Tres dias em cada, inclusive o do meio, que nao tem insight nenhum.
    expect(porNome.get("A")?.days.map((day) => day.date)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-03",
    ]);
    expect(porNome.get("A")?.days.map((day) => day.hasData)).toEqual([true, false, true]);
  });

  it("soma no dia certo de cada campanha", async () => {
    const accountId = await seedAccount();
    const campanha = await seedCampaign(accountId, "camp_a", { name: "A" });
    const rows = insightRows([campanha], ["2026-06-01"]);
    await db.prisma.dailyInsight.createMany({ data: rows });

    const [serie] = await getCampaignDailySeries(accountId, "2026-06-01", "2026-06-01");

    expect(totalsOf(serie.days[0])).toEqual(sumTotals(rows));
  });

  // O zero-fill preenche os dias de dentro do periodo; nao inventa campanha que
  // nao rodou nele. Quem quer o catalogo inteiro da conta usa getCampaignTable.
  it("deixa de fora a campanha sem insight no periodo", async () => {
    const accountId = await seedAccount();
    const campanha = await seedCampaign(accountId, "camp_a", { name: "A" });
    await seedCampaign(accountId, "camp_b", { name: "Sem dado" });
    await db.prisma.dailyInsight.createMany({
      data: insightRows([campanha], ["2026-06-01"]),
    });

    const series = await getCampaignDailySeries(accountId, "2026-06-01", "2026-06-01");

    expect(series.map((serie) => serie.name)).toEqual(["A"]);
  });

  it("nao mistura campanha de outra conta", async () => {
    const minhaConta = await seedAccount();
    const outraConta = await seedAccount();
    const minha = await seedCampaign(minhaConta, "camp_a", { name: "Minha" });
    const alheia = await seedCampaign(outraConta, "camp_b", { name: "Alheia" });
    await db.prisma.dailyInsight.createMany({
      data: insightRows([minha, alheia], ["2026-06-01"]),
    });

    const series = await getCampaignDailySeries(minhaConta, "2026-06-01", "2026-06-01");

    expect(series.map((serie) => serie.name)).toEqual(["Minha"]);
  });

  it("devolve vazio em periodo sem insight nenhum", async () => {
    const accountId = await seedAccount();
    await seedCampaign(accountId, "camp_a");

    expect(await getCampaignDailySeries(accountId, "2026-06-01", "2026-06-03")).toEqual([]);
  });

  it("derruba com periodo mal formado", async () => {
    const accountId = await seedAccount();
    await expect(getCampaignDailySeries(accountId, "2026-06-32", "2026-06-03")).rejects.toThrow(
      RangeError,
    );
  });
});

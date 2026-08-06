import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountStatus,
  CampaignObjective,
  CampaignStatus,
  Platform,
} from "@/generated/prisma/enums";
import { addDays, todayIn } from "@/lib/dates";
import type {
  AdsProvider,
  FetchInsightsParams,
  ProviderAccount,
  ProviderCampaign,
  ProviderInsight,
} from "@/lib/providers";
import { createTestDatabase, idleInTransactionCount, resetTables, type TestDatabase } from "@/test/db";

// Precisa ser hoisted: os factories de vi.mock rodam antes de qualquer
// inicializacao de modulo, entao a caixa que eles leem tem que existir antes.
const wiring = vi.hoisted(() => ({
  prisma: null as unknown,
  provider: null as unknown,
}));

vi.mock("@/lib/db/client", () => ({
  getPrisma: () => wiring.prisma,
}));

// Substitui so o getProvider; as classes de erro continuam sendo as reais, senao
// o `instanceof TransientProviderError` do retry nunca casaria.
vi.mock("@/lib/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/providers")>()),
  getProvider: () => wiring.provider,
}));

const { TransientProviderError, UnknownAccountError } = await import("@/lib/providers");
const { DEFAULT_LOOKBACK_DAYS, syncAccount } = await import("./sync");

const TIMEZONE = "America/Sao_Paulo";
const ACCOUNT_EXTERNAL_ID = "act_100000042";

type InsightOverrides = Partial<Omit<ProviderInsight, "campaignExternalId" | "date">>;

function insight(
  campaignExternalId: string,
  date: string,
  overrides: InsightOverrides = {},
): ProviderInsight {
  return {
    campaignExternalId,
    date,
    impressions: 10_000,
    clicks: 250,
    spendCents: 45_000,
    conversions: 12,
    conversionValueCents: 189_000,
    reach: 7_000,
    ...overrides,
  };
}

const CAMPAIGNS: readonly ProviderCampaign[] = [
  {
    externalId: "camp_bf_conv",
    name: "Black Friday - Conversão",
    objective: CampaignObjective.CONVERSIONS,
    status: CampaignStatus.ACTIVE,
    dailyBudgetCents: 60_000,
  },
  {
    externalId: "camp_leads",
    name: "Captação de Leads",
    objective: CampaignObjective.LEADS,
    status: CampaignStatus.ACTIVE,
    dailyBudgetCents: 30_000,
  },
];

function windowDates(count: number): string[] {
  const until = addDays(todayIn(TIMEZONE), -1);
  return Array.from({ length: count }, (_, index) => addDays(until, -index)).reverse();
}

type StubOptions = {
  campaigns?: readonly ProviderCampaign[];
  insights?: readonly ProviderInsight[];
  failInsights?: () => Error | null;
};

type ProviderStub = AdsProvider & {
  readonly calls: FetchInsightsParams[];
  readonly campaignCalls: string[];
};

function stubProvider(options: StubOptions = {}): ProviderStub {
  const calls: FetchInsightsParams[] = [];
  const campaignCalls: string[] = [];

  return {
    platform: Platform.META,
    calls,
    campaignCalls,
    getAccount(accountExternalId: string): Promise<ProviderAccount> {
      return Promise.reject(new UnknownAccountError(accountExternalId));
    },
    listCampaigns(accountExternalId: string): Promise<ProviderCampaign[]> {
      campaignCalls.push(accountExternalId);
      return Promise.resolve([...(options.campaigns ?? CAMPAIGNS)]);
    },
    fetchInsights(params: FetchInsightsParams): Promise<ProviderInsight[]> {
      calls.push(params);

      const failure = options.failInsights?.();
      if (failure) {
        return Promise.reject(failure);
      }

      return Promise.resolve([...(options.insights ?? [])]);
    },
  };
}

let db: TestDatabase;

async function seedAccount(status: AccountStatus = AccountStatus.ACTIVE): Promise<string> {
  const user = await db.prisma.user.create({
    data: { email: "dono@lojademo.com.br", name: "Dono" },
  });

  const account = await db.prisma.adAccount.create({
    data: {
      userId: user.id,
      externalId: ACCOUNT_EXTERNAL_ID,
      platform: Platform.META,
      name: "Loja Demo",
      currency: "BRL",
      timezone: TIMEZONE,
      status,
    },
  });

  return account.id;
}

function useProvider(options: StubOptions = {}): ProviderStub {
  const provider = stubProvider(options);
  wiring.provider = provider;
  return provider;
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
  wiring.provider = null;
});

describe("syncAccount: conta", () => {
  it("devolve erro tipado, sem lancar, quando a conta nao existe", async () => {
    useProvider();

    const result = await syncAccount("nao-existe");

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("ACCOUNT_NOT_FOUND");
  });

  // Conta desconectada perdeu o token: chamar a plataforma so gastaria cota.
  it("recusa conta DISCONNECTED sem tocar no provedor", async () => {
    const adAccountId = await seedAccount(AccountStatus.DISCONNECTED);
    const provider = useProvider();

    const result = await syncAccount(adAccountId);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("ACCOUNT_DISCONNECTED");
    expect(provider.campaignCalls).toEqual([]);
  });

  it("recusa lookbackDays invalido", async () => {
    const adAccountId = await seedAccount();
    useProvider();

    for (const lookbackDays of [0, -1, 2.5, Number.NaN]) {
      const result = await syncAccount(adAccountId, { lookbackDays });
      expect(result.ok === false && result.error.code, `lookbackDays=${lookbackDays}`).toBe(
        "INVALID_LOOKBACK",
      );
    }
  });
});

describe("syncAccount: janela", () => {
  // Ate ontem, nunca ate hoje: o dia corrente ainda esta sendo medido e entraria
  // pela metade, aparecendo como queda de spend no ultimo ponto do grafico.
  it("pede 28 dias terminando ontem no fuso da conta", async () => {
    const adAccountId = await seedAccount();
    const provider = useProvider();

    const result = await syncAccount(adAccountId);
    const until = addDays(todayIn(TIMEZONE), -1);

    expect(result.ok).toBe(true);
    expect(provider.calls).toEqual([
      {
        accountExternalId: ACCOUNT_EXTERNAL_ID,
        since: addDays(until, -(DEFAULT_LOOKBACK_DAYS - 1)),
        until,
      },
    ]);
  });

  it("respeita lookbackDays customizado", async () => {
    const adAccountId = await seedAccount();
    const provider = useProvider();

    await syncAccount(adAccountId, { lookbackDays: 7 });
    const until = addDays(todayIn(TIMEZONE), -1);

    expect(provider.calls[0]).toMatchObject({ since: addDays(until, -6), until });
  });
});

describe("syncAccount: idempotencia", () => {
  it("duas execucoes seguidas nao duplicam nenhuma linha", async () => {
    const adAccountId = await seedAccount();
    const dates = windowDates(3);
    const insights = CAMPAIGNS.flatMap((campaign) =>
      dates.map((date) => insight(campaign.externalId, date)),
    );
    useProvider({ insights });

    const first = await syncAccount(adAccountId);
    const before = await db.prisma.dailyInsight.findMany({ orderBy: { id: "asc" } });

    const second = await syncAccount(adAccountId);
    const after = await db.prisma.dailyInsight.findMany({ orderBy: { id: "asc" } });

    expect(first.ok && first.summary).toMatchObject({
      campaignsSynced: 2,
      insightsInserted: insights.length,
      insightsUpdated: 0,
      insightsSkipped: 0,
    });
    expect(second.ok && second.summary).toMatchObject({
      campaignsSynced: 2,
      insightsInserted: 0,
      insightsUpdated: insights.length,
      insightsSkipped: 0,
    });

    expect(after).toHaveLength(insights.length);
    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
    expect(await db.prisma.campaign.count()).toBe(CAMPAIGNS.length);
  });

  it("nao duplica campanha entre execucoes", async () => {
    const adAccountId = await seedAccount();
    useProvider();

    await syncAccount(adAccountId);
    const before = await db.prisma.campaign.findMany({ orderBy: { externalId: "asc" } });

    await syncAccount(adAccountId);
    const after = await db.prisma.campaign.findMany({ orderBy: { externalId: "asc" } });

    expect(after.map((row) => row.id)).toEqual(before.map((row) => row.id));
  });
});

describe("syncAccount: reingestao", () => {
  // A janela de atribuicao reescreve metrica ja coletada. Se isso virasse linha
  // nova, spend e ROAS do painel sairiam somados em dobro.
  it("atualiza a linha existente em vez de criar outra", async () => {
    const adAccountId = await seedAccount();
    const [date] = windowDates(1);
    const campaignId = CAMPAIGNS[0].externalId;

    useProvider({ insights: [insight(campaignId, date, { spendCents: 45_000, conversions: 12 })] });
    await syncAccount(adAccountId);
    const before = await db.prisma.dailyInsight.findFirstOrThrow();

    useProvider({
      insights: [
        insight(campaignId, date, {
          spendCents: 51_300,
          conversions: 19,
          conversionValueCents: 244_000,
        }),
      ],
    });
    const result = await syncAccount(adAccountId);
    const rows = await db.prisma.dailyInsight.findMany();

    expect(result.ok && result.summary).toMatchObject({
      insightsInserted: 0,
      insightsUpdated: 1,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(before.id);
    expect(rows[0].spendCents).toBe(51_300);
    expect(rows[0].conversions).toBe(19);
    expect(rows[0].conversionValueCents).toBe(244_000);
    expect(rows[0].ingestedAt.getTime()).toBeGreaterThanOrEqual(before.ingestedAt.getTime());
  });

  it("atualiza nome, status e orcamento da campanha sem recria-la", async () => {
    const adAccountId = await seedAccount();
    useProvider({ campaigns: [CAMPAIGNS[0]] });
    await syncAccount(adAccountId);
    const before = await db.prisma.campaign.findFirstOrThrow();

    useProvider({
      campaigns: [
        {
          ...CAMPAIGNS[0],
          name: "Black Friday - Conversão (v2)",
          status: CampaignStatus.PAUSED,
          dailyBudgetCents: 90_000,
        },
      ],
    });
    await syncAccount(adAccountId);
    const after = await db.prisma.campaign.findMany();

    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before.id);
    expect(after[0].name).toBe("Black Friday - Conversão (v2)");
    expect(after[0].status).toBe(CampaignStatus.PAUSED);
    expect(after[0].dailyBudgetCents).toBe(90_000);
  });

  // A API real filtra campanha arquivada do listCampaigns mas ainda serve insight
  // dela. Sem campanha para ancorar, a linha nao tem onde ir; some do resumo.
  it("conta insight de campanha desconhecida em vez de descartar calado", async () => {
    const adAccountId = await seedAccount();
    const [date] = windowDates(1);
    useProvider({
      campaigns: [CAMPAIGNS[0]],
      insights: [insight(CAMPAIGNS[0].externalId, date), insight("camp_arquivada", date)],
    });

    const result = await syncAccount(adAccountId);

    expect(result.ok && result.summary).toMatchObject({
      insightsInserted: 1,
      insightsSkipped: 1,
    });
    expect(await db.prisma.dailyInsight.count()).toBe(1);
  });
});

describe("syncAccount: falhas do provedor", () => {
  it("supera erro transitorio pelo retry", async () => {
    const adAccountId = await seedAccount();
    const [date] = windowDates(1);
    let attempts = 0;

    const provider = useProvider({
      insights: [insight(CAMPAIGNS[0].externalId, date)],
      failInsights: () => {
        attempts += 1;
        return attempts <= 2 ? new TransientProviderError("rate limit") : null;
      },
    });

    const result = await syncAccount(adAccountId);

    expect(result.ok).toBe(true);
    expect(provider.calls).toHaveLength(3);
    expect(await db.prisma.dailyInsight.count()).toBe(1);
  });

  it("devolve erro tipado e nao deixa transacao aberta quando a falha persiste", async () => {
    const adAccountId = await seedAccount();
    const provider = useProvider({
      failInsights: () => new TransientProviderError("plataforma fora do ar"),
    });

    const result = await syncAccount(adAccountId);

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(result.ok === false && result.error.adAccountId).toBe(adAccountId);
    expect(provider.calls).toHaveLength(3);

    // Nada escrito: a busca no provedor acontece antes da transacao, entao a
    // falha nao chega a abrir escrita nenhuma.
    expect(await db.prisma.dailyInsight.count()).toBe(0);
    expect(await db.prisma.campaign.count()).toBe(0);
    expect(await idleInTransactionCount()).toBe(0);

    // Se a transacao tivesse ficado aberta, este write travaria no lock ate o
    // timeout em vez de concluir.
    useProvider({ insights: [insight(CAMPAIGNS[0].externalId, windowDates(1)[0])] });
    const recovered = await syncAccount(adAccountId);

    expect(recovered.ok).toBe(true);
    expect(await db.prisma.dailyInsight.count()).toBe(1);
  });
});

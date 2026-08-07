import { afterEach, describe, expect, it } from "vitest";
import { AccountStatus } from "@/generated/prisma/enums";
import { addDays, todayIn } from "@/lib/dates";
import { DAYS, DEFAULT_END_DATE } from "@/lib/mock/generator";
import {
  InvalidDateRangeError,
  ProviderConfigError,
  TransientProviderError,
  UnknownAccountError,
} from "./errors";
import { MockProvider, type MockProviderConfig } from "./mock";

const ACCOUNT = "act_100000042";
const START_DATE = "2026-04-08";
const CAMPAIGN_COUNT = 4;

// endDate fixo em DEFAULT_END_DATE: estes testes verificam o dado que o
// gerador produz, nao o fallback dinamico do provider (isso e testado a
// parte, no describe "MOCK_PROVIDER_END_DATE").
function testProvider(overrides: Partial<MockProviderConfig> = {}): MockProvider {
  return new MockProvider({
    endDate: DEFAULT_END_DATE,
    errorRate: 0,
    random: () => 0,
    sleep: () => Promise.resolve(),
    ...overrides,
  });
}

function fullWindow(accountExternalId = ACCOUNT) {
  return { accountExternalId, since: START_DATE, until: DEFAULT_END_DATE };
}

describe("MockProvider.getAccount", () => {
  it("expoe moeda, fuso e status sem os campos de banco", async () => {
    const account = await testProvider().getAccount(ACCOUNT);

    expect(account).toEqual({
      externalId: ACCOUNT,
      name: "Loja Demo",
      currency: "BRL",
      timezone: "America/Sao_Paulo",
      status: AccountStatus.ACTIVE,
    });
    expect(Object.keys(account).sort()).toEqual([
      "currency",
      "externalId",
      "name",
      "status",
      "timezone",
    ]);
  });

  it("passa pela rede simulada como os outros metodos", async () => {
    await expect(testProvider({ errorRate: 1 }).getAccount(ACCOUNT)).rejects.toBeInstanceOf(
      TransientProviderError,
    );
    await expect(testProvider().getAccount("act_abc")).rejects.toBeInstanceOf(UnknownAccountError);
  });
});

describe("MockProvider.listCampaigns", () => {
  it("devolve as campanhas do gerador sem os campos de banco", async () => {
    const campaigns = await testProvider().listCampaigns(ACCOUNT);

    expect(campaigns.map((campaign) => campaign.externalId)).toEqual([
      "camp_bf_conv",
      "camp_rmk_30d",
      "camp_tof_video",
      "camp_leads",
    ]);

    for (const campaign of campaigns) {
      expect(Object.keys(campaign).sort()).toEqual([
        "dailyBudgetCents",
        "externalId",
        "name",
        "objective",
        "status",
      ]);
    }
  });

  it("mantem orcamento em centavos inteiros", async () => {
    const campaigns = await testProvider().listCampaigns(ACCOUNT);

    for (const campaign of campaigns) {
      expect(campaign.dailyBudgetCents === null || Number.isInteger(campaign.dailyBudgetCents)).toBe(
        true,
      );
    }
  });
});

describe("MockProvider.fetchInsights", () => {
  it("cobre a janela inteira do gerador", async () => {
    const insights = await testProvider().fetchInsights(fullWindow());

    expect(insights).toHaveLength(DAYS * CAMPAIGN_COUNT);
    expect(Object.keys(insights[0]).sort()).toEqual([
      "campaignExternalId",
      "clicks",
      "conversionValueCents",
      "conversions",
      "date",
      "impressions",
      "reach",
      "spendCents",
    ]);
  });

  it("filtra pelo periodo de forma inclusiva nas duas pontas", async () => {
    const provider = testProvider();

    const singleDay = await provider.fetchInsights({
      accountExternalId: ACCOUNT,
      since: "2026-07-10",
      until: "2026-07-10",
    });
    expect(singleDay).toHaveLength(CAMPAIGN_COUNT);
    expect(singleDay.every((insight) => insight.date === "2026-07-10")).toBe(true);

    const week = await provider.fetchInsights({
      accountExternalId: ACCOUNT,
      since: "2026-07-01",
      until: "2026-07-07",
    });
    expect(week).toHaveLength(7 * CAMPAIGN_COUNT);
    expect(week.every((insight) => insight.date >= "2026-07-01" && insight.date <= "2026-07-07")).toBe(
      true,
    );
  });

  it("devolve vazio para periodo invertido ou fora da janela gerada", async () => {
    const provider = testProvider();

    await expect(
      provider.fetchInsights({
        accountExternalId: ACCOUNT,
        since: "2026-07-10",
        until: "2026-07-01",
      }),
    ).resolves.toEqual([]);

    await expect(
      provider.fetchInsights({
        accountExternalId: ACCOUNT,
        since: "2020-01-01",
        until: "2020-01-31",
      }),
    ).resolves.toEqual([]);
  });

  it("liga cada insight ao externalId da campanha, nao ao id interno", async () => {
    const insights = await testProvider().fetchInsights(fullWindow());
    const leads = insights.filter((insight) => insight.campaignExternalId === "camp_leads");

    expect(leads).toHaveLength(DAYS);
    expect(new Set(insights.map((insight) => insight.campaignExternalId))).toEqual(
      new Set(["camp_bf_conv", "camp_rmk_30d", "camp_tof_video", "camp_leads"]),
    );
  });

  it("nao deixa valor monetario virar float", async () => {
    const insights = await testProvider().fetchInsights(fullWindow());

    for (const insight of insights) {
      expect(Number.isInteger(insight.spendCents)).toBe(true);
      expect(Number.isInteger(insight.conversionValueCents)).toBe(true);
    }
  });

  // A ancora e fixa em endDate justamente para que reingerir o mesmo dia nao
  // produza numero diferente.
  it("devolve o mesmo dado para a mesma data em chamadas diferentes", async () => {
    const params = { accountExternalId: ACCOUNT, since: "2026-06-01", until: "2026-06-30" };

    const first = await testProvider().fetchInsights(params);
    const second = await testProvider().fetchInsights(params);

    expect(first).toEqual(second);
  });

  // Este e o teste que quebra se alguem ancorar a janela em `until` em vez de
  // endDate: o mesmo dia passaria a valer numeros diferentes conforme o periodo.
  it("da o mesmo dado para um dia, pedido sozinho ou dentro de um periodo maior", async () => {
    const provider = testProvider();

    const narrow = await provider.fetchInsights({
      accountExternalId: ACCOUNT,
      since: "2026-06-10",
      until: "2026-06-12",
    });
    const wide = await provider.fetchInsights({
      accountExternalId: ACCOUNT,
      since: "2026-05-01",
      until: DEFAULT_END_DATE,
    });

    expect(narrow).toEqual(
      wide.filter((insight) => insight.date >= "2026-06-10" && insight.date <= "2026-06-12"),
    );
  });

  it("desloca a janela quando endDate e outro", async () => {
    const insights = await testProvider({ endDate: "2026-05-01" }).fetchInsights({
      accountExternalId: ACCOUNT,
      since: "2026-04-25",
      until: "2026-05-01",
    });

    expect(insights).toHaveLength(7 * CAMPAIGN_COUNT);
  });
});

describe("MockProvider: rede simulada", () => {
  it("dorme dentro da faixa de 150 a 400ms", async () => {
    const slept: number[] = [];
    const sleep = (ms: number) => {
      slept.push(ms);
      return Promise.resolve();
    };

    await testProvider({ random: () => 0, sleep }).listCampaigns(ACCOUNT);
    await testProvider({ random: () => 0.999, sleep }).listCampaigns(ACCOUNT);

    expect(slept[0]).toBe(150);
    expect(slept[1]).toBeGreaterThan(399);
    expect(slept[1]).toBeLessThan(400);
  });

  it("lanca erro transitorio quando errorRate e 1", async () => {
    const provider = testProvider({ errorRate: 1 });

    await expect(provider.listCampaigns(ACCOUNT)).rejects.toBeInstanceOf(TransientProviderError);
    await expect(provider.fetchInsights(fullWindow())).rejects.toBeInstanceOf(
      TransientProviderError,
    );
  });

  it("nunca lanca quando errorRate e 0, mesmo com sorteio real", async () => {
    const provider = testProvider({ errorRate: 0, random: Math.random });

    for (let attempt = 0; attempt < 50; attempt++) {
      await expect(provider.listCampaigns(ACCOUNT)).resolves.toHaveLength(CAMPAIGN_COUNT);
    }
  });

  it("cobra a latencia antes de falhar", async () => {
    const slept: number[] = [];
    const provider = testProvider({
      errorRate: 1,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });

    await expect(provider.listCampaigns(ACCOUNT)).rejects.toBeInstanceOf(TransientProviderError);
    expect(slept).toHaveLength(1);
  });
});

describe("MOCK_PROVIDER_END_DATE", () => {
  const original = process.env.MOCK_PROVIDER_END_DATE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.MOCK_PROVIDER_END_DATE;
      return;
    }
    process.env.MOCK_PROVIDER_END_DATE = original;
  });

  it("reancora a janela sem precisar passar endDate", async () => {
    process.env.MOCK_PROVIDER_END_DATE = "2026-05-01";

    const insights = await new MockProvider({
      errorRate: 0,
      sleep: () => Promise.resolve(),
    }).fetchInsights({
      accountExternalId: ACCOUNT,
      since: "2026-04-25",
      until: "2026-05-01",
    });

    expect(insights).toHaveLength(7 * CAMPAIGN_COUNT);
  });

  it("reancora sozinha em ontem (UTC) quando ausente ou vazia", async () => {
    delete process.env.MOCK_PROVIDER_END_DATE;
    const provider = new MockProvider({ errorRate: 0, sleep: () => Promise.resolve() });
    const expectedAnchor = addDays(todayIn("UTC"), -1);

    const lastDay = await provider.fetchInsights({
      accountExternalId: ACCOUNT,
      since: expectedAnchor,
      until: expectedAnchor,
    });

    expect(lastDay).toHaveLength(CAMPAIGN_COUNT);
  });

  it("derruba na hora com data invalida em vez de cair no fallback", () => {
    process.env.MOCK_PROVIDER_END_DATE = "2026-02-30";

    expect(() => new MockProvider()).toThrow(ProviderConfigError);
  });
});

describe("MockProvider: entrada invalida", () => {
  it("rejeita conta que nao existe", async () => {
    const provider = testProvider();

    await expect(provider.listCampaigns("conta-qualquer")).rejects.toBeInstanceOf(
      UnknownAccountError,
    );
    await expect(provider.listCampaigns("")).rejects.toBeInstanceOf(UnknownAccountError);
    await expect(provider.fetchInsights(fullWindow("act_abc"))).rejects.toBeInstanceOf(
      UnknownAccountError,
    );
  });

  it("rejeita id abaixo do offset, que daria seed negativa", async () => {
    await expect(testProvider().listCampaigns("act_99999999")).rejects.toBeInstanceOf(
      UnknownAccountError,
    );
  });

  // Sem isso, duas contas diferentes serviriam exatamente o mesmo dado.
  it("nao aceita zero a esquerda como a mesma conta", async () => {
    await expect(testProvider().listCampaigns("act_0100000042")).rejects.toBeInstanceOf(
      UnknownAccountError,
    );
  });

  it("rejeita data que existe no formato mas nao no calendario", async () => {
    const provider = testProvider();

    for (const impossible of ["2026-02-30", "2026-04-31", "2026-13-01"]) {
      await expect(
        provider.fetchInsights({
          accountExternalId: ACCOUNT,
          since: impossible,
          until: DEFAULT_END_DATE,
        }),
      ).rejects.toBeInstanceOf(InvalidDateRangeError);
    }
  });

  it("rejeita data fora do formato YYYY-MM-DD", async () => {
    const provider = testProvider();

    await expect(
      provider.fetchInsights({
        accountExternalId: ACCOUNT,
        since: "01/07/2026",
        until: DEFAULT_END_DATE,
      }),
    ).rejects.toBeInstanceOf(InvalidDateRangeError);

    await expect(
      provider.fetchInsights({
        accountExternalId: ACCOUNT,
        since: START_DATE,
        until: "2026-07",
      }),
    ).rejects.toBeInstanceOf(InvalidDateRangeError);
  });
});

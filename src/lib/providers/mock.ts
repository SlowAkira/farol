import { Platform } from "@/generated/prisma/enums";
import { addDays, todayIn } from "@/lib/dates";
import { generateAccount } from "@/lib/mock/generator";
import {
  InvalidDateRangeError,
  ProviderConfigError,
  TransientProviderError,
  UnknownAccountError,
} from "./errors";
import type {
  AdsProvider,
  FetchInsightsParams,
  ProviderAccount,
  ProviderCampaign,
  ProviderInsight,
} from "./types";

const MIN_LATENCY_MS = 150;
const MAX_LATENCY_MS = 400;

// Espelha o `act_${100_000_000 + seed}` de generator.ts:293. Mudar la exige
// mudar aqui, mas exportar o offset so para isso acoplaria o gerador ao provedor.
const ACCOUNT_ID_OFFSET = 100_000_000;
const ACCOUNT_ID_PATTERN = /^act_(\d+)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type MockProviderConfig = {
  readonly platform: Platform;
  readonly endDate: string;
  readonly minLatencyMs: number;
  readonly maxLatencyMs: number;
  readonly errorRate: number;
  readonly random: () => number;
  readonly sleep: (ms: number) => Promise<void>;
};

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envErrorRate(): number {
  const parsed = Number.parseFloat(process.env.MOCK_PROVIDER_ERROR_RATE ?? "");
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 0;
}

const FALLBACK_TIMEZONE = "UTC";

// Sem a env var, a janela reancora sozinha em "ontem" (UTC) a cada chamada: uma
// data fixa faria "ultimos N dias" caminhar para fora dos 120 dias gerados e
// voltar vazio poucas semanas depois de qualquer valor hardcoded.
function defaultEndDate(): string {
  return addDays(todayIn(FALLBACK_TIMEZONE), -1);
}

// Data invalida aqui derruba na hora em vez de cair no fallback: quem setou a
// variavel queria reancorar a janela, e servir uma data errada em silencio
// esconderia o erro ate alguem estranhar o grafico vazio.
function envEndDate(): string {
  const configured = process.env.MOCK_PROVIDER_END_DATE?.trim();
  if (!configured) {
    return defaultEndDate();
  }

  if (!isIsoDate(configured)) {
    throw new ProviderConfigError(
      `MOCK_PROVIDER_END_DATE invalido: "${configured}". Use uma data real no formato YYYY-MM-DD.`,
    );
  }

  return configured;
}

// O round-trip barra zero a esquerda: sem ele "act_0100000042" e "act_100000042"
// cairiam na mesma seed e serviriam o mesmo dado para contas diferentes. Ele nao
// cobre seed negativa (act_99999999 volta identico), por isso os dois testes.
function seedFor(accountExternalId: string): number {
  const match = ACCOUNT_ID_PATTERN.exec(accountExternalId);
  if (match === null) {
    throw new UnknownAccountError(accountExternalId);
  }

  const seed = Number(match[1]) - ACCOUNT_ID_OFFSET;
  if (
    seed < 0 ||
    !Number.isSafeInteger(seed) ||
    `act_${ACCOUNT_ID_OFFSET + seed}` !== accountExternalId
  ) {
    throw new UnknownAccountError(accountExternalId);
  }

  return seed;
}

// O formato sozinho aceita "2026-02-30", que o Date acomoda virando 02/03 e faria
// a janela filtrar em silencio a data errada. Date aqui e so validador; o valor
// que circula continua sendo a string.
function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertDate(field: "since" | "until", value: string): void {
  if (!isIsoDate(value)) {
    throw new InvalidDateRangeError(field, value);
  }
}

export class MockProvider implements AdsProvider {
  readonly platform: Platform;

  private readonly config: MockProviderConfig;

  constructor(config: Partial<MockProviderConfig> = {}) {
    this.config = {
      platform: Platform.META,
      endDate: envEndDate(),
      minLatencyMs: MIN_LATENCY_MS,
      maxLatencyMs: MAX_LATENCY_MS,
      errorRate: envErrorRate(),
      random: Math.random,
      sleep: realSleep,
      ...config,
    };
    this.platform = this.config.platform;
  }

  async getAccount(accountExternalId: string): Promise<ProviderAccount> {
    const seed = seedFor(accountExternalId);
    await this.simulateNetwork();

    const { account } = generateAccount(seed, this.config.endDate);

    return {
      externalId: account.externalId,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
      status: account.status,
    };
  }

  async listCampaigns(accountExternalId: string): Promise<ProviderCampaign[]> {
    const seed = seedFor(accountExternalId);
    await this.simulateNetwork();

    return generateAccount(seed, this.config.endDate).campaigns.map((campaign) => ({
      externalId: campaign.externalId,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      dailyBudgetCents: campaign.dailyBudgetCents,
    }));
  }

  async fetchInsights({
    accountExternalId,
    since,
    until,
  }: FetchInsightsParams): Promise<ProviderInsight[]> {
    const seed = seedFor(accountExternalId);
    assertDate("since", since);
    assertDate("until", until);
    await this.simulateNetwork();

    const { campaigns, insights } = generateAccount(seed, this.config.endDate);
    const externalIdById = new Map(campaigns.map((campaign) => [campaign.id, campaign.externalId]));

    const result: ProviderInsight[] = [];

    for (const insight of insights) {
      if (insight.date < since || insight.date > until) {
        continue;
      }

      const campaignExternalId = externalIdById.get(insight.campaignId);
      if (campaignExternalId === undefined) {
        continue;
      }

      result.push({
        campaignExternalId,
        date: insight.date,
        impressions: insight.impressions,
        clicks: insight.clicks,
        spendCents: insight.spendCents,
        conversions: insight.conversions,
        conversionValueCents: insight.conversionValueCents,
        reach: insight.reach,
      });
    }

    return result;
  }

  // A latencia vem antes do sorteio de falha porque uma chamada que falha na rede
  // tambem custa tempo, e o retry precisa pagar esse custo para ser realista.
  private async simulateNetwork(): Promise<void> {
    const { minLatencyMs, maxLatencyMs, errorRate, random, sleep } = this.config;

    await sleep(minLatencyMs + random() * (maxLatencyMs - minLatencyMs));

    if (random() < errorRate) {
      throw new TransientProviderError(
        `Falha transitoria simulada em ${this.platform} (errorRate=${errorRate}).`,
      );
    }
  }
}

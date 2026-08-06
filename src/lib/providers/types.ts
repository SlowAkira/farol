import type {
  AccountStatus,
  CampaignObjective,
  CampaignStatus,
  Platform,
} from "@/generated/prisma/enums";

// Moeda e fuso vem daqui e de mais lugar nenhum: sao propriedade da conta na
// plataforma. Sem isso a ingestao acabaria cravando "BRL" e "America/Sao_Paulo"
// fora de src/lib/providers, que e exatamente o que a regra de fronteira proibe.
export type ProviderAccount = {
  readonly externalId: string;
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  readonly status: AccountStatus;
};

export type ProviderCampaign = {
  readonly externalId: string;
  readonly name: string;
  readonly objective: CampaignObjective;
  readonly status: CampaignStatus;
  readonly dailyBudgetCents: number | null;
};

export type ProviderInsight = {
  readonly campaignExternalId: string;
  readonly date: string;
  readonly impressions: number;
  readonly clicks: number;
  readonly spendCents: number;
  readonly conversions: number;
  readonly conversionValueCents: number;
  readonly reach: number;
};

export type FetchInsightsParams = {
  readonly accountExternalId: string;
  readonly since: string;
  readonly until: string;
};

// Nada de campo derivado aqui: o provedor entrega o que a plataforma mediu, e
// razoes entre esses numeros saem so de src/lib/metrics.
export interface AdsProvider {
  readonly platform: Platform;
  getAccount(accountExternalId: string): Promise<ProviderAccount>;
  listCampaigns(accountExternalId: string): Promise<ProviderCampaign[]>;
  fetchInsights(params: FetchInsightsParams): Promise<ProviderInsight[]>;
}

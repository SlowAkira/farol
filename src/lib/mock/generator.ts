import type { AdAccount, Campaign, DailyInsight } from "@/generated/prisma/browser";
import {
  AccountStatus,
  CampaignObjective,
  CampaignStatus,
  Platform,
} from "@/generated/prisma/enums";

export const DEFAULT_END_DATE = "2026-08-05";
export const DAYS = 120;

export const MIN_CTR = 0.008;
export const MAX_CTR = 0.035;

const WEEKEND_SPEND_FACTOR = 0.75;
const WEEKEND_CTR_FACTOR = 1.08;
const NOISE_STD_DEV = 0.08;
const MS_PER_DAY = 86_400_000;
const INGESTION_HOUR_UTC = 3;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function gaussian(rng: () => number, mean: number, stdDev: number): number {
  const u = 1 - rng();
  const v = rng();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// A cauda da normal pode devolver multiplicador negativo. Em 480 linhas x varias
// metricas isso vira teste intermitente, entao a cauda e cortada.
function noise(rng: () => number): number {
  return clamp(gaussian(rng, 1, NOISE_STD_DEV), 0.6, 1.4);
}

function toEpochDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  return fromEpochDay(toEpochDay(date) + days);
}

function atUtcMidnight(date: string): Date {
  return new Date(toEpochDay(date) * MS_PER_DAY);
}

function isWeekend(date: string): boolean {
  const weekday = atUtcMidnight(date).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function trend(growth: number, progress: number): number {
  return 1 + (growth - 1) * progress;
}

type RevenueModel =
  | { kind: "roas"; roas: number; conversionRate: number }
  | { kind: "cpa"; cpaCents: number; degradeFromDay: number; degradeFactor: number }
  | { kind: "none" };

type CampaignProfile = {
  externalId: string;
  name: string;
  objective: CampaignObjective;
  dailyBudgetCents: number | null;
  baseSpendCents: number;
  spendGrowth: number;
  cpmCents: number;
  baseCtr: number;
  baseFrequency: number;
  frequencyGrowth: number;
  revenue: RevenueModel;
  pausedDays: number;
};

const PROFILES: readonly CampaignProfile[] = [
  {
    externalId: "camp_bf_conv",
    name: "Black Friday - Conversão",
    objective: CampaignObjective.CONVERSIONS,
    dailyBudgetCents: 60_000,
    baseSpendCents: 45_000,
    spendGrowth: 2.2,
    cpmCents: 2_800,
    baseCtr: 0.021,
    baseFrequency: 1.6,
    frequencyGrowth: 1,
    revenue: { kind: "roas", roas: 4.2, conversionRate: 0.045 },
    pausedDays: 0,
  },
  {
    externalId: "camp_rmk_30d",
    name: "Remarketing 30d",
    objective: CampaignObjective.CONVERSIONS,
    dailyBudgetCents: 10_000,
    baseSpendCents: 8_000,
    spendGrowth: 1.1,
    cpmCents: 4_200,
    baseCtr: 0.028,
    baseFrequency: 2.2,
    frequencyGrowth: 2.5,
    revenue: { kind: "roas", roas: 7, conversionRate: 0.075 },
    pausedDays: 0,
  },
  {
    externalId: "camp_tof_video",
    name: "Topo de Funil - Vídeo",
    objective: CampaignObjective.AWARENESS,
    dailyBudgetCents: 35_000,
    baseSpendCents: 30_000,
    spendGrowth: 1.15,
    cpmCents: 900,
    baseCtr: 0.009,
    baseFrequency: 1.15,
    frequencyGrowth: 1.1,
    revenue: { kind: "none" },
    pausedDays: 2,
  },
  {
    externalId: "camp_leads",
    name: "Captação de Leads",
    objective: CampaignObjective.LEADS,
    dailyBudgetCents: 30_000,
    baseSpendCents: 25_000,
    spendGrowth: 1,
    cpmCents: 1_800,
    baseCtr: 0.016,
    baseFrequency: 1.5,
    frequencyGrowth: 1.05,
    revenue: { kind: "cpa", cpaCents: 1_800, degradeFromDay: 95, degradeFactor: 1.6 },
    pausedDays: 0,
  },
];

// Fora das bordas para nao colidir com as janelas que os testes de tendencia
// comparam entre inicio e fim do periodo.
function pickPausedDays(rng: () => number, count: number): ReadonlySet<number> {
  const picked = new Set<number>();
  while (picked.size < count) {
    picked.add(10 + Math.floor(rng() * (DAYS - 20)));
  }
  return picked;
}

function conversionsFor(
  revenue: RevenueModel,
  spendCents: number,
  clicks: number,
  day: number,
  rng: () => number,
): number {
  switch (revenue.kind) {
    case "roas":
      return Math.round(clicks * revenue.conversionRate * noise(rng));
    case "cpa": {
      const degraded = day >= revenue.degradeFromDay ? revenue.degradeFactor : 1;
      return Math.round(spendCents / (revenue.cpaCents * degraded * noise(rng)));
    }
    case "none":
      return 0;
  }
}

function revenueFor(revenue: RevenueModel, spendCents: number, rng: () => number): number {
  return revenue.kind === "roas" ? Math.round(spendCents * revenue.roas * noise(rng)) : 0;
}

function idleInsight(campaignId: string, date: string): DailyInsight {
  return {
    id: `ins_${campaignId}_${date}`,
    campaignId,
    date,
    impressions: 0,
    clicks: 0,
    spendCents: 0,
    conversions: 0,
    conversionValueCents: 0,
    reach: 0,
    ingestedAt: new Date((toEpochDay(date) + 1) * MS_PER_DAY + INGESTION_HOUR_UTC * 3_600_000),
  };
}

function generateInsights(
  profile: CampaignProfile,
  campaignId: string,
  startDate: string,
  rng: () => number,
): DailyInsight[] {
  const pausedDays = pickPausedDays(rng, profile.pausedDays);
  const insights: DailyInsight[] = [];

  for (let day = 0; day < DAYS; day++) {
    const date = addDays(startDate, day);

    if (pausedDays.has(day)) {
      insights.push(idleInsight(campaignId, date));
      continue;
    }

    const progress = day / (DAYS - 1);
    const weekend = isWeekend(date);

    const spendCents = Math.round(
      profile.baseSpendCents *
        trend(profile.spendGrowth, progress) *
        (weekend ? WEEKEND_SPEND_FACTOR : 1) *
        noise(rng),
    );

    if (spendCents <= 0) {
      insights.push(idleInsight(campaignId, date));
      continue;
    }

    const cpmCents = profile.cpmCents * noise(rng);
    const impressions = Math.round((spendCents / cpmCents) * 1000);

    const ctr = clamp(
      profile.baseCtr * (weekend ? WEEKEND_CTR_FACTOR : 1) * noise(rng),
      MIN_CTR,
      MAX_CTR,
    );
    // O arredondamento de clicks pode empurrar a razao clicks/impressions para
    // fora da faixa, entao a faixa e reaplicada ja no inteiro.
    //
    // Os limites vao ordenados porque com impressions baixo o piso ultrapassa o
    // teto (em 10 impressions, ceil(0.008*10)=1 contra floor(0.035*10)=0): nao
    // existe inteiro dentro da faixa. Invertidos, o clamp devolveria o teto e
    // zeraria os cliques; ordenados, o valor arredondado passa intacto. Nenhum
    // perfil atual chega perto disso, e a ordenacao existe para que mexer nos
    // perfis nao reintroduza a inversao em silencio.
    const lowerClicks = Math.ceil(MIN_CTR * impressions);
    const upperClicks = Math.floor(MAX_CTR * impressions);
    const clicks = clamp(
      Math.round(impressions * ctr),
      Math.min(lowerClicks, upperClicks),
      Math.max(lowerClicks, upperClicks),
    );

    const frequency = Math.max(
      1.01,
      profile.baseFrequency * trend(profile.frequencyGrowth, progress) * noise(rng),
    );
    const reach = Math.min(impressions, Math.round(impressions / frequency));

    const conversions = Math.min(
      clicks,
      conversionsFor(profile.revenue, spendCents, clicks, day, rng),
    );

    insights.push({
      id: `ins_${campaignId}_${date}`,
      campaignId,
      date,
      impressions,
      clicks,
      spendCents,
      conversions,
      conversionValueCents: revenueFor(profile.revenue, spendCents, rng),
      reach,
      ingestedAt: new Date(
        (toEpochDay(date) + 1) * MS_PER_DAY + INGESTION_HOUR_UTC * 3_600_000,
      ),
    });
  }

  return insights;
}

export type GeneratedAccount = {
  account: AdAccount;
  campaigns: Campaign[];
  insights: DailyInsight[];
};

export function generateAccount(
  seed: number,
  endDate: string = DEFAULT_END_DATE,
): GeneratedAccount {
  const startDate = addDays(endDate, -(DAYS - 1));

  const account: AdAccount = {
    id: `acc_${seed}`,
    userId: `user_${seed}`,
    externalId: `act_${100_000_000 + seed}`,
    platform: Platform.META,
    name: "Loja Demo",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    status: AccountStatus.ACTIVE,
    createdAt: atUtcMidnight(addDays(startDate, -30)),
  };

  const campaigns: Campaign[] = [];
  const insights: DailyInsight[] = [];

  PROFILES.forEach((profile, index) => {
    const campaignId = `camp_${seed}_${index}`;
    campaigns.push({
      id: campaignId,
      adAccountId: account.id,
      externalId: profile.externalId,
      name: profile.name,
      objective: profile.objective,
      status: CampaignStatus.ACTIVE,
      dailyBudgetCents: profile.dailyBudgetCents,
      createdAt: atUtcMidnight(addDays(startDate, -7)),
    });

    // Stream proprio por campanha: mexer numa nao desloca a sequencia das outras.
    const rng = mulberry32(seed + index * 0x9e3779b1);
    insights.push(...generateInsights(profile, campaignId, startDate, rng));
  });

  return { account, campaigns, insights };
}

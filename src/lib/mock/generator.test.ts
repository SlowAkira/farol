import { describe, expect, it } from "vitest";
import type { DailyInsight } from "@/generated/prisma/browser";
import { DAYS, DEFAULT_END_DATE, MAX_CTR, MIN_CTR, generateAccount } from "./generator";

const SEED = 42;
const generated = generateAccount(SEED);

const BLACK_FRIDAY = 0;
const REMARKETING = 1;
const TOP_OF_FUNNEL = 2;
const LEADS = 3;

function insightsOf(campaignIndex: number): DailyInsight[] {
  const campaignId = generated.campaigns[campaignIndex].id;
  return generated.insights.filter((insight) => insight.campaignId === campaignId);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return sum(values) / values.length;
}

function roasOf(insights: DailyInsight[]): number {
  return sum(insights.map((i) => i.conversionValueCents)) / sum(insights.map((i) => i.spendCents));
}

function cpaOf(insights: DailyInsight[]): number {
  return sum(insights.map((i) => i.spendCents)) / sum(insights.map((i) => i.conversions));
}

function cpmOf(insights: DailyInsight[]): number {
  return (sum(insights.map((i) => i.spendCents)) / sum(insights.map((i) => i.impressions))) * 1000;
}

function isWeekendDate(date: string): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

describe("determinismo", () => {
  it("devolve resultado identico para a mesma seed", () => {
    expect(generateAccount(SEED)).toEqual(generateAccount(SEED));
  });

  it("devolve resultado diferente para seed diferente", () => {
    expect(generateAccount(SEED).insights).not.toEqual(generateAccount(SEED + 1).insights);
  });

  it("nao depende do relogio: a janela termina na ancora fixa", () => {
    const dates = insightsOf(BLACK_FRIDAY).map((i) => i.date);
    expect(dates[dates.length - 1]).toBe(DEFAULT_END_DATE);
    expect(dates[0]).toBe("2026-04-08");
  });

  it("aceita override da data final", () => {
    const custom = generateAccount(SEED, "2025-12-31");
    const dates = custom.insights.filter((i) => i.campaignId === custom.campaigns[0].id);
    expect(dates[dates.length - 1].date).toBe("2025-12-31");
  });
});

describe("forma dos dados", () => {
  it("gera 4 campanhas cobrindo 120 dias cada", () => {
    expect(generated.campaigns).toHaveLength(4);
    expect(generated.insights).toHaveLength(4 * DAYS);
    for (let campaign = 0; campaign < 4; campaign++) {
      expect(insightsOf(campaign)).toHaveLength(DAYS);
    }
  });

  it("usa datas YYYY-MM-DD unicas e crescentes por campanha", () => {
    for (let campaign = 0; campaign < 4; campaign++) {
      const dates = insightsOf(campaign).map((i) => i.date);
      expect(new Set(dates).size).toBe(DAYS);
      for (const date of dates) {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      expect([...dates].sort()).toEqual(dates);
    }
  });

  it("usa inteiros nao negativos em toda metrica", () => {
    for (const insight of generated.insights) {
      const metrics = [
        insight.impressions,
        insight.clicks,
        insight.spendCents,
        insight.conversions,
        insight.conversionValueCents,
        insight.reach,
      ];
      for (const metric of metrics) {
        expect(Number.isInteger(metric)).toBe(true);
        expect(metric).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe("invariantes", () => {
  it("mantem conversoes menores ou iguais a cliques", () => {
    for (const insight of generated.insights) {
      expect(insight.conversions).toBeLessThanOrEqual(insight.clicks);
    }
  });

  it("mantem alcance menor ou igual a impressoes", () => {
    for (const insight of generated.insights) {
      expect(insight.reach).toBeLessThanOrEqual(insight.impressions);
    }
  });

  it("mantem CTR entre 0.8% e 3.5% nos dias com impressoes", () => {
    const active = generated.insights.filter((i) => i.impressions > 0);
    expect(active.length).toBeGreaterThan(0);
    for (const insight of active) {
      const ctr = insight.clicks / insight.impressions;
      expect(ctr).toBeGreaterThanOrEqual(MIN_CTR);
      expect(ctr).toBeLessThanOrEqual(MAX_CTR);
    }
  });

  // Uma seed so nao prova nada num gerador estocastico: a cauda do ruido pode
  // violar uma invariante numa seed que o teste acima nunca visita. As violacoes
  // sao acumuladas em vez de assertadas uma a uma porque 200 seeds x 480 linhas
  // estoura o timeout so no overhead do expect.
  it("mantem todas as invariantes para qualquer seed", () => {
    const violations: string[] = [];

    for (let seed = 0; seed < 200; seed++) {
      for (const insight of generateAccount(seed).insights) {
        const where = `seed ${seed} ${insight.id}`;
        if (insight.conversions > insight.clicks) {
          violations.push(`${where}: conversions ${insight.conversions} > clicks ${insight.clicks}`);
        }
        if (insight.reach > insight.impressions) {
          violations.push(`${where}: reach ${insight.reach} > impressions ${insight.impressions}`);
        }
        if (insight.spendCents < 0 || !Number.isInteger(insight.spendCents)) {
          violations.push(`${where}: spendCents invalido ${insight.spendCents}`);
        }
        if (insight.impressions > 0) {
          const ctr = insight.clicks / insight.impressions;
          if (ctr < MIN_CTR || ctr > MAX_CTR) {
            violations.push(`${where}: CTR ${(ctr * 100).toFixed(3)}% fora da faixa`);
          }
        }
      }
    }

    expect(violations.slice(0, 10)).toEqual([]);
  });

  it("mantem a anomalia do dia 95 para qualquer seed", () => {
    const weak: string[] = [];

    for (let seed = 0; seed < 200; seed++) {
      const account = generateAccount(seed);
      const leads = account.insights.filter((i) => i.campaignId === account.campaigns[LEADS].id);
      const ratio = cpaOf(leads.slice(95)) / cpaOf(leads.slice(0, 95));
      if (ratio <= 1.4) {
        weak.push(`seed ${seed}: razao de CPA apenas ${ratio.toFixed(3)}`);
      }
    }

    expect(weak.slice(0, 10)).toEqual([]);
  });
});

describe("sazonalidade semanal", () => {
  it("gasta cerca de 25% menos no fim de semana", () => {
    const insights = insightsOf(LEADS);
    const weekend = mean(insights.filter((i) => isWeekendDate(i.date)).map((i) => i.spendCents));
    const weekday = mean(insights.filter((i) => !isWeekendDate(i.date)).map((i) => i.spendCents));
    expect(weekend / weekday).toBeGreaterThan(0.7);
    expect(weekend / weekday).toBeLessThan(0.8);
  });

  it("tem CTR levemente maior no fim de semana", () => {
    for (const campaign of [BLACK_FRIDAY, LEADS]) {
      const insights = insightsOf(campaign);
      const ctr = (subset: DailyInsight[]) => mean(subset.map((i) => i.clicks / i.impressions));
      const weekend = ctr(insights.filter((i) => isWeekendDate(i.date)));
      const weekday = ctr(insights.filter((i) => !isWeekendDate(i.date)));
      expect(weekend).toBeGreaterThan(weekday);
    }
  });
});

describe("perfis das campanhas", () => {
  it("mantem ROAS saudavel em torno de 4.2 na Black Friday", () => {
    expect(roasOf(insightsOf(BLACK_FRIDAY))).toBeGreaterThan(4.2 * 0.9);
    expect(roasOf(insightsOf(BLACK_FRIDAY))).toBeLessThan(4.2 * 1.1);
  });

  it("cresce o gasto ao longo do periodo na Black Friday", () => {
    const insights = insightsOf(BLACK_FRIDAY);
    const first = mean(insights.slice(0, 30).map((i) => i.spendCents));
    const last = mean(insights.slice(-30).map((i) => i.spendCents));
    expect(last).toBeGreaterThan(first * 1.5);
  });

  it("mantem ROAS alto e volume baixo no Remarketing", () => {
    expect(roasOf(insightsOf(REMARKETING))).toBeGreaterThan(7 * 0.9);
    expect(roasOf(insightsOf(REMARKETING))).toBeLessThan(7 * 1.1);
    expect(sum(insightsOf(REMARKETING).map((i) => i.impressions))).toBeLessThan(
      sum(insightsOf(BLACK_FRIDAY).map((i) => i.impressions)) / 5,
    );
  });

  it("satura o publico do Remarketing com frequencia crescente", () => {
    const insights = insightsOf(REMARKETING);
    const frequency = (subset: DailyInsight[]) => mean(subset.map((i) => i.impressions / i.reach));
    expect(frequency(insights.slice(-30))).toBeGreaterThan(frequency(insights.slice(0, 30)));
  });

  it("nao converte e tem CPM baixo no Topo de Funil", () => {
    const insights = insightsOf(TOP_OF_FUNNEL);
    expect(sum(insights.map((i) => i.conversions))).toBe(0);
    expect(sum(insights.map((i) => i.conversionValueCents))).toBe(0);
    for (const campaign of [BLACK_FRIDAY, REMARKETING, LEADS]) {
      expect(cpmOf(insights)).toBeLessThan(cpmOf(insightsOf(campaign)));
    }
  });

  it("entrega muito alcance no Topo de Funil", () => {
    const insights = insightsOf(TOP_OF_FUNNEL).filter((i) => i.impressions > 0);
    expect(sum(insights.map((i) => i.reach))).toBeGreaterThan(
      sum(generated.insights.map((i) => i.reach)) / 2,
    );
  });

  it("pausa exatamente dois dias no Topo de Funil", () => {
    const paused = insightsOf(TOP_OF_FUNNEL).filter((i) => i.spendCents === 0);
    expect(paused).toHaveLength(2);
    for (const day of paused) {
      expect(day.impressions).toBe(0);
      expect(day.clicks).toBe(0);
      expect(day.reach).toBe(0);
    }
  });
});

describe("anomalia da Captacao de Leads", () => {
  const insights = insightsOf(LEADS);
  const baseline = cpaOf(insights.slice(0, 95));
  const afterBreak = cpaOf(insights.slice(95));

  it("mantem CPA estavel em torno de 18 reais antes do dia 95", () => {
    expect(baseline).toBeGreaterThan(1_800 * 0.9);
    expect(baseline).toBeLessThan(1_800 * 1.1);
  });

  it("degrada o CPA em cerca de 60% a partir do dia 95", () => {
    expect(afterBreak / baseline).toBeGreaterThan(1.5);
  });

  it("nao recupera o CPA ate o fim do periodo", () => {
    expect(cpaOf(insights.slice(-10)) / baseline).toBeGreaterThan(1.4);
  });

  it("quebra de forma abrupta, nao gradual", () => {
    const before = cpaOf(insights.slice(85, 95));
    const after = cpaOf(insights.slice(95, 105));
    expect(after / before).toBeGreaterThan(1.4);
  });
});

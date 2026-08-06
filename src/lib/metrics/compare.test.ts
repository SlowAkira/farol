import { describe, expect, it } from "vitest";
import { compareMetrics } from "./compare";
import type { MetricTotals } from "./calc";

function totals(overrides: Partial<MetricTotals> = {}): MetricTotals {
  return {
    impressions: 10_000,
    clicks: 100,
    spendCents: 40_000,
    conversions: 10,
    conversionValueCents: 200_000,
    reach: 8_000,
    ...overrides,
  };
}

const CURRENT = totals({
  clicks: 200,
  spendCents: 50_000,
  conversions: 20,
  conversionValueCents: 400_000,
});
const PREVIOUS = totals();

describe("compareMetrics", () => {
  it("devolve valor atual, anterior e deltas para cada metrica", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.ctrPercent).toEqual({
      current: 2,
      previous: 1,
      deltaAbsolute: 1,
      deltaPercent: 100,
      lowerIsBetter: false,
    });
    expect(comparison.cpcCents).toEqual({
      current: 250,
      previous: 400,
      deltaAbsolute: -150,
      deltaPercent: -37.5,
      lowerIsBetter: true,
    });
    expect(comparison.cpmCents).toEqual({
      current: 5_000,
      previous: 4_000,
      deltaAbsolute: 1_000,
      deltaPercent: 25,
      lowerIsBetter: true,
    });
    expect(comparison.cpaCents).toEqual({
      current: 2_500,
      previous: 4_000,
      deltaAbsolute: -1_500,
      deltaPercent: -37.5,
      lowerIsBetter: true,
    });
    expect(comparison.roasRatio).toEqual({
      current: 8,
      previous: 5,
      deltaAbsolute: 3,
      deltaPercent: 60,
      lowerIsBetter: false,
    });
    expect(comparison.frequencyRatio).toEqual({
      current: 1.25,
      previous: 1.25,
      deltaAbsolute: 0,
      deltaPercent: 0,
      lowerIsBetter: false,
    });
  });

  it("marca CPA, CPC e CPM como lowerIsBetter e o resto como higherIsBetter", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.cpaCents.lowerIsBetter).toBe(true);
    expect(comparison.cpcCents.lowerIsBetter).toBe(true);
    expect(comparison.cpmCents.lowerIsBetter).toBe(true);
    expect(comparison.ctrPercent.lowerIsBetter).toBe(false);
    expect(comparison.roasRatio.lowerIsBetter).toBe(false);
    expect(comparison.frequencyRatio.lowerIsBetter).toBe(false);
  });

  it("propaga null quando o periodo anterior nao tem denominador", () => {
    const previousZerado = totals({
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      conversionValueCents: 0,
      reach: 0,
      impressions: 0,
    });

    const comparison = compareMetrics(CURRENT, previousZerado);

    for (const metric of Object.values(comparison)) {
      expect(metric.previous).toBeNull();
      expect(metric.deltaAbsolute).toBeNull();
      expect(metric.deltaPercent).toBeNull();
      expect(metric.current).not.toBeNull();
    }
  });

  it("nao divide por zero no delta percentual quando o valor anterior e exatamente zero", () => {
    // impressoes existem mas cliques sao zero: ctr anterior e 0, nao null, e
    // e exatamente esse zero que nao pode virar denominador do delta percentual.
    const previousComCliqueZero = totals({ clicks: 0 });

    const comparison = compareMetrics(CURRENT, previousComCliqueZero);

    expect(comparison.ctrPercent.previous).toBe(0);
    expect(comparison.ctrPercent.deltaAbsolute).toBe(2);
    expect(comparison.ctrPercent.deltaPercent).toBeNull();
  });

  it("devolve delta zero para periodos identicos", () => {
    const comparison = compareMetrics(CURRENT, CURRENT);

    for (const metric of Object.values(comparison)) {
      expect(metric.deltaAbsolute).toBe(0);
      expect(metric.deltaPercent).toBe(0);
    }
  });
});

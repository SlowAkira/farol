import { describe, expect, it } from "vitest";
import { computeMetrics, cpa, cpc, cpm, ctr, frequency, roas, type MetricTotals } from "./calc";

function totals(overrides: Partial<MetricTotals> = {}): MetricTotals {
  return {
    impressions: 10_000,
    clicks: 200,
    spendCents: 50_000,
    conversions: 20,
    conversionValueCents: 400_000,
    reach: 8_000,
    ...overrides,
  };
}

describe("ctr", () => {
  it("calcula cliques sobre impressoes em percentual", () => {
    expect(ctr(200, 10_000)).toBeCloseTo(2);
    expect(ctr(0, 10_000)).toBe(0);
  });

  it("devolve null com impressoes zero, nunca NaN ou Infinity", () => {
    expect(ctr(0, 0)).toBeNull();
    expect(ctr(5, 0)).toBeNull();
  });
});

describe("cpc", () => {
  it("calcula gasto por clique em centavos", () => {
    expect(cpc(50_000, 200)).toBeCloseTo(250);
  });

  it("devolve null com zero cliques", () => {
    expect(cpc(50_000, 0)).toBeNull();
    expect(cpc(0, 0)).toBeNull();
  });
});

describe("cpm", () => {
  it("calcula gasto por mil impressoes em centavos", () => {
    expect(cpm(50_000, 10_000)).toBeCloseTo(5_000);
  });

  it("devolve null com zero impressoes", () => {
    expect(cpm(50_000, 0)).toBeNull();
  });
});

describe("cpa", () => {
  it("calcula gasto por conversao em centavos", () => {
    expect(cpa(50_000, 20)).toBeCloseTo(2_500);
  });

  it("devolve null com zero conversoes", () => {
    expect(cpa(50_000, 0)).toBeNull();
  });
});

describe("roas", () => {
  it("calcula retorno sobre gasto como razao", () => {
    expect(roas(400_000, 50_000)).toBeCloseTo(8);
  });

  it("devolve null com gasto zero", () => {
    expect(roas(400_000, 0)).toBeNull();
    expect(roas(0, 0)).toBeNull();
  });
});

describe("frequency", () => {
  it("calcula impressoes por pessoa alcancada", () => {
    expect(frequency(10_000, 8_000)).toBeCloseTo(1.25);
  });

  it("devolve null com alcance zero", () => {
    expect(frequency(10_000, 0)).toBeNull();
  });
});

describe("computeMetrics", () => {
  it("calcula as seis metricas a partir dos totais crus", () => {
    expect(computeMetrics(totals())).toEqual({
      ctrPercent: 2,
      cpcCents: 250,
      cpmCents: 5_000,
      cpaCents: 2_500,
      roasRatio: 8,
      frequencyRatio: 1.25,
    });
  });

  it("nunca devolve NaN ou Infinity, so number ou null", () => {
    const zeroed = computeMetrics({
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      conversionValueCents: 0,
      reach: 0,
    });

    for (const value of Object.values(zeroed)) {
      expect(value === null || Number.isFinite(value)).toBe(true);
    }
    expect(zeroed).toEqual({
      ctrPercent: null,
      cpcCents: null,
      cpmCents: null,
      cpaCents: null,
      roasRatio: null,
      frequencyRatio: null,
    });
  });

  it("mantem metricas validas mesmo quando so um denominador zera", () => {
    const result = computeMetrics(totals({ reach: 0 }));

    expect(result.frequencyRatio).toBeNull();
    expect(result.ctrPercent).toBe(2);
    expect(result.roasRatio).toBe(8);
  });
});

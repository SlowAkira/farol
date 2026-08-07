import { describe, expect, it } from "vitest";
import { changeTone, compareMetrics, type MetricsComparison } from "./compare";
import type { MetricKey, MetricTotals } from "./calc";

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

const DERIVED_KEYS = [
  "ctrPercent",
  "cpcCents",
  "cpmCents",
  "cpaCents",
  "roasRatio",
  "frequencyRatio",
] as const satisfies readonly MetricKey[];

function derivedOnly(comparison: MetricsComparison) {
  return DERIVED_KEYS.map((key) => comparison[key]);
}

describe("compareMetrics", () => {
  it("devolve valor atual, anterior e deltas para cada metrica", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.ctrPercent).toEqual({
      current: 2,
      previous: 1,
      deltaAbsolute: 1,
      deltaPercent: 100,
      betterDirection: "higher",
    });
    expect(comparison.cpcCents).toEqual({
      current: 250,
      previous: 400,
      deltaAbsolute: -150,
      deltaPercent: -37.5,
      betterDirection: "lower",
    });
    expect(comparison.cpmCents).toEqual({
      current: 5_000,
      previous: 4_000,
      deltaAbsolute: 1_000,
      deltaPercent: 25,
      betterDirection: "lower",
    });
    expect(comparison.cpaCents).toEqual({
      current: 2_500,
      previous: 4_000,
      deltaAbsolute: -1_500,
      deltaPercent: -37.5,
      betterDirection: "lower",
    });
    expect(comparison.roasRatio).toEqual({
      current: 8,
      previous: 5,
      deltaAbsolute: 3,
      deltaPercent: 60,
      betterDirection: "higher",
    });
    expect(comparison.frequencyRatio).toEqual({
      current: 1.25,
      previous: 1.25,
      deltaAbsolute: 0,
      deltaPercent: 0,
      betterDirection: "neutral",
    });
  });

  // O painel usa gasto e conversoes como KPI ao lado de ROAS e CPA, entao a
  // comparacao precisa cobrir tambem o que e soma pura, nao so o que e divisao.
  it("compara tambem os totais somados, sem passar por divisao nenhuma", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.spendCents).toEqual({
      current: 50_000,
      previous: 40_000,
      deltaAbsolute: 10_000,
      deltaPercent: 25,
      betterDirection: "neutral",
    });
    expect(comparison.conversions).toEqual({
      current: 20,
      previous: 10,
      deltaAbsolute: 10,
      deltaPercent: 100,
      betterDirection: "higher",
    });
  });

  it("marca custo como lower e retorno como higher", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.cpaCents.betterDirection).toBe("lower");
    expect(comparison.cpcCents.betterDirection).toBe("lower");
    expect(comparison.cpmCents.betterDirection).toBe("lower");
    expect(comparison.ctrPercent.betterDirection).toBe("higher");
    expect(comparison.roasRatio.betterDirection).toBe("higher");
  });

  // Frequencia subindo e fadiga de criativo, nao melhora; frequencia caindo
  // demais e entrega insuficiente. Sem lado bom monotonico, nao se pinta.
  it("nao da lado bom para frequencia", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.frequencyRatio.betterDirection).toBe("neutral");

    const frequenciaSubindo = compareMetrics(
      totals({ impressions: 20_000, reach: 8_000 }),
      totals({ impressions: 10_000, reach: 8_000 }),
    );
    expect(frequenciaSubindo.frequencyRatio.deltaAbsolute).toBeGreaterThan(0);
    expect(changeTone(frequenciaSubindo.frequencyRatio)).toBe("neutral");
  });

  // Volume nao tem lado bom: gasto subindo nao e melhora nem piora sozinho, e
  // "neutral" e o que impede o cartao de pintar isso de verde.
  it("marca gasto, impressoes e alcance como neutral", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    expect(comparison.spendCents.betterDirection).toBe("neutral");
    expect(comparison.impressions.betterDirection).toBe("neutral");
    expect(comparison.reach.betterDirection).toBe("neutral");
    expect(comparison.clicks.betterDirection).toBe("neutral");
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

    // So as derivadas: total sem linha nenhuma soma zero, nao null, e e por isso
    // que o zero do gasto anterior continua sendo um numero aqui.
    for (const metric of derivedOnly(comparison)) {
      expect(metric.previous).toBeNull();
      expect(metric.deltaAbsolute).toBeNull();
      expect(metric.deltaPercent).toBeNull();
      expect(metric.current).not.toBeNull();
    }

    expect(comparison.spendCents.previous).toBe(0);
    expect(comparison.spendCents.deltaAbsolute).toBe(50_000);
    expect(comparison.spendCents.deltaPercent).toBeNull();
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

describe("changeTone", () => {
  it("le a melhora pela direcao da metrica, nao pelo sinal do delta", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);

    // CPA caiu (delta negativo) e isso e melhora; CPM subiu e isso e piora.
    expect(changeTone(comparison.cpaCents)).toBe("positive");
    expect(changeTone(comparison.cpmCents)).toBe("negative");
    expect(changeTone(comparison.roasRatio)).toBe("positive");
  });

  it("nao pinta metrica neutra nem delta ausente ou nulo", () => {
    const comparison = compareMetrics(CURRENT, PREVIOUS);
    const semAnterior = compareMetrics(CURRENT, totals({ impressions: 0, clicks: 0 }));

    expect(changeTone(comparison.spendCents)).toBe("neutral");
    expect(changeTone(comparison.frequencyRatio)).toBe("neutral");
    expect(changeTone(semAnterior.ctrPercent)).toBe("neutral");
  });
});

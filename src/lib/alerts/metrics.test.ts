import { describe, expect, it } from "vitest";
import { AlertComparison, AlertMetric } from "@/generated/prisma/enums";
import { metricValues, type MetricTotals } from "@/lib/metrics/calc";
import {
  ALERT_METRICS,
  alertMetricDefinition,
  alertMetricSpec,
  thresholdScale,
  thresholdToValue,
  valueToThreshold,
} from "./metrics";

const METRICAS = Object.values(AlertMetric);

const ZERO: MetricTotals = {
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  conversionValueCents: 0,
  reach: 0,
};

describe("mapa de metricas de alerta", () => {
  it("cobre todo AlertMetric", () => {
    expect(Object.keys(ALERT_METRICS).sort()).toEqual([...METRICAS].sort());
  });

  it("aponta para uma metrica que existe em src/lib/metrics", () => {
    const disponiveis = Object.keys(metricValues(ZERO));

    for (const metrica of METRICAS) {
      expect(disponiveis, metrica).toContain(alertMetricSpec(metrica).key);
    }
  });

  // O que amarra a escala a unidade: dinheiro ja chega em centavos das funcoes de
  // calc.ts, entao nao escala; razao e percentual chegam fracionarios e precisam
  // dos centesimos para caber num Int. Metrica nova com a escala trocada quebra
  // aqui, e nao no primeiro alerta que disparar cem vezes fora de hora.
  it("usa escala 1 para dinheiro e 100 para razao e percentual", () => {
    for (const metrica of METRICAS) {
      const esperada = alertMetricDefinition(metrica).unit === "currency" ? 1 : 100;
      expect(alertMetricSpec(metrica).scale, metrica).toBe(esperada);
    }
  });

  it("mede volume por um total, nunca por metrica derivada", () => {
    for (const metrica of METRICAS) {
      const { volumeField, minimumVolume } = alertMetricSpec(metrica);

      expect(ZERO, metrica).toHaveProperty(volumeField);
      expect(minimumVolume, metrica).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("escala do threshold", () => {
  it("le dinheiro em centavos, na mesma unidade que a metrica devolve", () => {
    // R$ 45,00 de CPA e o mesmo 4500 que cpaCents devolve: nada a converter.
    expect(thresholdToValue(AlertMetric.CPA, AlertComparison.ABSOLUTE_THRESHOLD, 4_500)).toBe(4_500);
    expect(valueToThreshold(AlertMetric.SPEND, AlertComparison.ABSOLUTE_THRESHOLD, 90_000)).toBe(
      90_000,
    );
  });

  it("le razao e percentual em centesimos", () => {
    expect(thresholdToValue(AlertMetric.ROAS, AlertComparison.ABSOLUTE_THRESHOLD, 250)).toBe(2.5);
    expect(thresholdToValue(AlertMetric.CTR, AlertComparison.ABSOLUTE_THRESHOLD, 180)).toBe(1.8);
    expect(
      valueToThreshold(AlertMetric.FREQUENCY, AlertComparison.ABSOLUTE_THRESHOLD, 3.2),
    ).toBe(320);
  });

  it("le PCT_CHANGE em centesimos de ponto percentual, seja qual for a metrica", () => {
    for (const metrica of METRICAS) {
      expect(thresholdScale(metrica, AlertComparison.PCT_CHANGE), metrica).toBe(100);
      expect(thresholdToValue(metrica, AlertComparison.PCT_CHANGE, 3_000), metrica).toBe(30);
    }
  });

  it("volta ao mesmo inteiro depois de ida e volta", () => {
    for (const metrica of METRICAS) {
      for (const comparacao of Object.values(AlertComparison)) {
        const threshold = 2_500;
        const valor = thresholdToValue(metrica, comparacao, threshold);

        expect(valueToThreshold(metrica, comparacao, valor), `${metrica}/${comparacao}`).toBe(
          threshold,
        );
      }
    }
  });
});

import { describe, expect, it } from "vitest";
import { metricUnavailability } from "./availability";
import { metricValues, type MetricKey, type MetricTotals } from "./calc";

const CHEIO: MetricTotals = {
  impressions: 10_000,
  clicks: 200,
  spendCents: 50_000,
  conversions: 20,
  conversionValueCents: 400_000,
  reach: 8_000,
};

const CAMPOS = Object.keys(CHEIO) as (keyof MetricTotals)[];

// Todas as combinacoes de "este campo esta zerado ou nao": 64 conjuntos de
// totais, que e o espaco inteiro do que faz uma metrica existir ou nao. Escolher
// alguns casos a mao deixaria justamente o cruzamento improvavel de fora, e e o
// improvavel que chega na tela como travessao sem explicacao.
function todasAsCombinacoes(): MetricTotals[] {
  return Array.from({ length: 2 ** CAMPOS.length }, (_, mascara) => {
    const totals = { ...CHEIO };
    CAMPOS.forEach((campo, indice) => {
      if ((mascara >> indice) % 2 === 1) {
        totals[campo] = 0;
      }
    });
    return totals;
  });
}

const CHAVES = Object.keys(metricValues(CHEIO)) as MetricKey[];

describe("metricUnavailability", () => {
  // O teste que importa: nao verifica frases, verifica que motivo e valor nunca
  // discordam. E o que impede um denominador novo em calc.ts de produzir null
  // sem explicacao, ou uma explicacao sobrar em cima de um numero valido.
  it("tem motivo exatamente quando a metrica e null", () => {
    for (const totals of todasAsCombinacoes()) {
      const values = metricValues(totals);

      for (const key of CHAVES) {
        const motivo = metricUnavailability(key, totals);
        expect(
          motivo !== null,
          `${key} com ${JSON.stringify(totals)}: valor ${values[key]}, motivo ${motivo}`,
        ).toBe(values[key] === null);
      }
    }
  });

  it("aponta a grandeza que falta, e nao uma frase generica", () => {
    expect(metricUnavailability("cpaCents", { ...CHEIO, conversions: 0 })).toBe(
      "Sem conversão registrada no período",
    );
    expect(metricUnavailability("roasRatio", { ...CHEIO, conversionValueCents: 0 })).toBe(
      "Sem valor de conversão registrado no período",
    );
    expect(metricUnavailability("ctrPercent", { ...CHEIO, impressions: 0 })).toBe(
      "Sem impressão registrada no período",
    );
    expect(metricUnavailability("frequencyRatio", { ...CHEIO, reach: 0 })).toBe(
      "Sem alcance registrado no período",
    );
  });

  it("prefere a falta de gasto a falta de receita no ROAS", () => {
    expect(metricUnavailability("roasRatio", { ...CHEIO, spendCents: 0 })).toBe(
      "Sem gasto registrado no período",
    );
  });

  it("nao acha motivo em total, que e soma medida e nao lacuna", () => {
    const zerado: MetricTotals = {
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      conversionValueCents: 0,
      reach: 0,
    };

    for (const key of CAMPOS) {
      expect(metricUnavailability(key, zerado)).toBeNull();
    }
  });
});

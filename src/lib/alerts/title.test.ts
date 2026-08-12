import { describe, expect, it } from "vitest";
import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import type { MetricTotals } from "@/lib/metrics/calc";
import type { AlertContext } from "./rules";
import { alertTitle } from "./title";

const TOTAIS: MetricTotals = {
  impressions: 100_000,
  clicks: 2_000,
  spendCents: 300_000,
  conversions: 100,
  conversionValueCents: 900_000,
  reach: 60_000,
};

function contexto(overrides: Partial<AlertContext> = {}): AlertContext {
  return {
    metric: AlertMetric.CPA,
    comparison: AlertComparison.PCT_CHANGE,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.CAMPAIGN,
    threshold: 30 * 100,
    windowDays: 7,
    campaign: { campaignId: "camp_1", campaignName: "Captação de Leads" },
    current: {
      period: { since: "2026-07-30", until: "2026-08-05" },
      value: 2_980,
      totals: TOTAIS,
    },
    previous: {
      period: { since: "2026-07-23", until: "2026-07-29" },
      value: 1_840,
      totals: TOTAIS,
    },
    deltaPercent: 61.95,
    ...overrides,
  };
}

// O Intl separa simbolo e numero com espaco inquebravel ("R$ 18,40"), que
// e o certo na tela e ilegivel no literal de um teste. Normalizar so aqui deixa
// a frase esperada escrita como se le, sem afrouxar nada do resto.
function semNbsp(texto: string): string {
  return texto.replace(/ /g, " ");
}

function titulo(overrides: Partial<AlertContext> = {}): string {
  return semNbsp(alertTitle(contexto(overrides), "Regra qualquer", "BRL"));
}

describe("alertTitle: variacao percentual", () => {
  // A frase do enunciado da fase, montada so a partir do context do disparo.
  it("escreve a alta de uma campanha com os dois valores", () => {
    expect(titulo()).toBe(
      "CPA da campanha Captação de Leads subiu 62% nos últimos 7 dias, de R$ 18,40 para R$ 29,80",
    );
  });

  it("escreve a queda com o verbo invertido", () => {
    expect(
      titulo({
        metric: AlertMetric.ROAS,
        direction: AlertDirection.BELOW,
        scope: AlertScope.ACCOUNT,
        campaign: null,
        current: { period: { since: "2026-07-30", until: "2026-08-05" }, value: 2.1, totals: TOTAIS },
        previous: { period: { since: "2026-07-23", until: "2026-07-29" }, value: 3.5, totals: TOTAIS },
        deltaPercent: -40,
      }),
    ).toBe("ROAS da conta caiu 40% nos últimos 7 dias, de 3,50× para 2,10×");
  });

  // Movimento pequeno perde a informacao se arredondar para inteiro: "subiu 1%"
  // nao e o numero que fez a regra disparar.
  it("mantem uma casa decimal em movimento pequeno", () => {
    expect(titulo({ deltaPercent: 3.42 })).toContain("subiu 3,4%");
  });

  it("dispensa a casa decimal em movimento grande", () => {
    expect(titulo({ deltaPercent: 61.95 })).toContain("subiu 62%");
  });

  it("cai para a frase sem valores quando a janela anterior nao tem numero", () => {
    expect(
      titulo({
        previous: { period: { since: "2026-07-23", until: "2026-07-29" }, value: null, totals: TOTAIS },
      }),
    ).toBe("CPA da campanha Captação de Leads subiu 62% nos últimos 7 dias");
  });

  it("escreve a janela de um dia no singular", () => {
    expect(titulo({ windowDays: 1 })).toContain("no último dia");
  });
});

describe("alertTitle: limiar absoluto", () => {
  it("escreve o valor medido e o limite", () => {
    expect(
      titulo({
        comparison: AlertComparison.ABSOLUTE_THRESHOLD,
        direction: AlertDirection.ABOVE,
        threshold: 6_000,
      }),
    ).toBe(
      "CPA da campanha Captação de Leads está em R$ 29,80 nos últimos 7 dias, acima do limite de R$ 60,00",
    );
  });

  it("escreve o lado de baixo para regra de piso", () => {
    expect(
      titulo({
        metric: AlertMetric.ROAS,
        comparison: AlertComparison.ABSOLUTE_THRESHOLD,
        direction: AlertDirection.BELOW,
        scope: AlertScope.ACCOUNT,
        campaign: null,
        threshold: 250,
        current: { period: { since: "2026-07-30", until: "2026-08-05" }, value: 1.8, totals: TOTAIS },
      }),
    ).toBe("ROAS da conta está em 1,80× nos últimos 7 dias, abaixo do limite de 2,50×");
  });

  it("usa a moeda da conta, e nao um simbolo fixo", () => {
    expect(
      titulo({ comparison: AlertComparison.ABSOLUTE_THRESHOLD, threshold: 6_000 }),
    ).toContain("R$");
    expect(
      alertTitle(
        contexto({ comparison: AlertComparison.ABSOLUTE_THRESHOLD, threshold: 6_000 }),
        "Regra qualquer",
        "USD",
      ),
    ).toContain("US$");
  });
});

describe("alertTitle: bordas", () => {
  // Context que nao passou pela validacao: o nome da regra e a unica coisa
  // verdadeira que sobrou, e e melhor que uma frase com buraco no meio.
  it("cai no nome da regra sem context", () => {
    expect(alertTitle(null, "Custo por conversão subiu no mês", "BRL")).toBe(
      "Custo por conversão subiu no mês",
    );
  });

  it("cai no sujeito da conta se o escopo e campanha mas o alvo sumiu", () => {
    expect(titulo({ campaign: null })).toContain("CPA da conta");
  });
});

import { describe, expect, it } from "vitest";
import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import type { MetricTotals } from "@/lib/metrics/calc";
import { evaluateRule, fingerprintFor, type AlertWindow, type EvaluableRule } from "./rules";

const PERIODO = { since: "2026-08-04", until: "2026-08-10" };
const PERIODO_ANTERIOR = { since: "2026-07-28", until: "2026-08-03" };

const ZERO: MetricTotals = {
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  conversionValueCents: 0,
  reach: 0,
};

function totais(overrides: Partial<MetricTotals>): MetricTotals {
  return { ...ZERO, ...overrides };
}

function janela(overrides: Partial<MetricTotals>): AlertWindow {
  return { period: PERIODO, totals: totais(overrides) };
}

function janelaAnterior(overrides: Partial<MetricTotals>): AlertWindow {
  return { period: PERIODO_ANTERIOR, totals: totais(overrides) };
}

function regra(overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  return {
    id: "regra_1",
    metric: AlertMetric.CPA,
    comparison: AlertComparison.ABSOLUTE_THRESHOLD,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.ACCOUNT,
    threshold: 4_500,
    windowDays: 7,
    ...overrides,
  };
}

// CPA de R$ 50,00 com volume folgado acima do piso de 30 conversoes.
const CPA_50 = { conversions: 40, spendCents: 200_000 };
// CPA de R$ 25,00, mesmo volume.
const CPA_25 = { conversions: 40, spendCents: 100_000 };

describe("evaluateRule: ABSOLUTE_THRESHOLD", () => {
  it("dispara com a metrica acima do limiar", () => {
    const resultado = evaluateRule({
      rule: regra({ threshold: 4_500 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado.kind).toBe("fired");
    expect(resultado.kind === "fired" && resultado.context).toMatchObject({
      metric: AlertMetric.CPA,
      comparison: AlertComparison.ABSOLUTE_THRESHOLD,
      direction: AlertDirection.ABOVE,
      threshold: 4_500,
      windowDays: 7,
      current: { period: PERIODO, value: 5_000 },
      previous: { period: PERIODO_ANTERIOR, value: 2_500 },
    });
  });

  it("nao dispara com a metrica abaixo do limiar", () => {
    const resultado = evaluateRule({
      rule: regra({ threshold: 6_000 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado.kind).toBe("clear");
  });

  // ABOVE e "acima", nao "acima ou igual": o limiar em si e o ultimo valor
  // aceitavel. Sem isto, um limiar redondo dispara no numero exato que a pessoa
  // escreveu como tolerado.
  it("nao dispara no valor exato do limiar", () => {
    const resultado = evaluateRule({
      rule: regra({ threshold: 5_000 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado.kind).toBe("clear");
  });

  it("em BELOW compara contra o proprio limiar, sem trocar o sinal", () => {
    const abaixo = evaluateRule({
      rule: regra({
        metric: AlertMetric.CTR,
        direction: AlertDirection.BELOW,
        threshold: 180,
      }),
      target: null,
      current: janela({ impressions: 100_000, clicks: 1_700 }),
      previous: janelaAnterior({ impressions: 100_000, clicks: 2_000 }),
    });

    expect(abaixo.kind).toBe("fired");

    const dentro = evaluateRule({
      rule: regra({
        metric: AlertMetric.CTR,
        direction: AlertDirection.BELOW,
        threshold: 180,
      }),
      target: null,
      current: janela({ impressions: 100_000, clicks: 1_900 }),
      previous: janelaAnterior({ impressions: 100_000, clicks: 2_000 }),
    });

    expect(dentro.kind).toBe("clear");
  });
});

describe("evaluateRule: PCT_CHANGE", () => {
  const pctChange = (overrides: Partial<EvaluableRule> = {}): EvaluableRule =>
    regra({ comparison: AlertComparison.PCT_CHANGE, threshold: 3_000, ...overrides });

  it("compara a janela contra a imediatamente anterior", () => {
    const resultado = evaluateRule({
      rule: pctChange(),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado.kind).toBe("fired");
    expect(resultado.kind === "fired" && resultado.context.deltaPercent).toBe(100);
  });

  it("nao dispara para cima quando a variacao fica sob o limiar", () => {
    const resultado = evaluateRule({
      rule: pctChange({ threshold: 12_000 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado.kind).toBe("clear");
  });

  // Em PCT_CHANGE o threshold e magnitude de movimento, entao BELOW compara
  // contra -threshold. Em ABSOLUTE_THRESHOLD ele e nivel, e BELOW compara contra
  // o proprio numero. A assimetria e a razao de existir este teste.
  it("em BELOW mede a queda contra o limiar negado", () => {
    const caiu = evaluateRule({
      rule: pctChange({ direction: AlertDirection.BELOW }),
      target: null,
      current: janela(CPA_25),
      previous: janelaAnterior(CPA_50),
    });

    expect(caiu.kind).toBe("fired");
    expect(caiu.kind === "fired" && caiu.context.deltaPercent).toBe(-50);

    const subiu = evaluateRule({
      rule: pctChange({ direction: AlertDirection.BELOW }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(subiu.kind).toBe("clear");
  });

  it("nao avalia sobre base zero", () => {
    const resultado = evaluateRule({
      rule: pctChange({ metric: AlertMetric.SPEND, threshold: 3_000 }),
      target: null,
      current: janela({ spendCents: 100_000 }),
      previous: janelaAnterior({ spendCents: 0 }),
    });

    expect(resultado).toEqual({ kind: "unevaluable", reason: "BASE_ZERO" });
  });
});

describe("evaluateRule: supressao", () => {
  it("nao dispara com volume insuficiente na janela atual", () => {
    const resultado = evaluateRule({
      rule: regra({ threshold: 4_500 }),
      target: null,
      // CPA de R$ 50,00 igual ao caso que dispara, mas sobre 29 conversoes: o
      // numero e o mesmo e a evidencia nao e.
      current: janela({ conversions: 29, spendCents: 145_000 }),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado).toEqual({ kind: "unevaluable", reason: "VOLUME_INSUFICIENTE" });
  });

  // Em PCT_CHANGE a janela anterior e o denominador da conta: pouca conversao la
  // atras faz qualquer variacao parecer enorme.
  it("nao dispara com volume insuficiente na janela anterior", () => {
    const resultado = evaluateRule({
      rule: regra({ comparison: AlertComparison.PCT_CHANGE, threshold: 3_000 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior({ conversions: 2, spendCents: 2_000 }),
    });

    expect(resultado).toEqual({ kind: "unevaluable", reason: "VOLUME_INSUFICIENTE" });
  });

  it("ignora a janela anterior quando a comparacao e absoluta", () => {
    const resultado = evaluateRule({
      rule: regra({ threshold: 4_500 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior({ conversions: 0, spendCents: 0 }),
    });

    expect(resultado.kind).toBe("fired");
  });

  // roas() devolve null com valor de conversao zerado (receita que ninguem
  // mediu, nao receita zero), e regra nenhuma pode disparar sobre isso.
  it("nao dispara com a metrica indisponivel", () => {
    const resultado = evaluateRule({
      rule: regra({
        metric: AlertMetric.ROAS,
        direction: AlertDirection.BELOW,
        threshold: 200,
      }),
      target: null,
      current: janela({ conversions: 40, spendCents: 100_000, conversionValueCents: 0 }),
      previous: janelaAnterior({ conversions: 40, spendCents: 100_000, conversionValueCents: 300_000 }),
    });

    expect(resultado).toEqual({ kind: "unevaluable", reason: "METRICA_INDISPONIVEL" });
  });
});

describe("evaluateRule: contexto", () => {
  it("guarda a campanha e os totais das duas janelas", () => {
    const resultado = evaluateRule({
      rule: regra({ scope: AlertScope.CAMPAIGN, threshold: 4_500 }),
      target: { campaignId: "camp_1", campaignName: "Leads — Busca" },
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });

    expect(resultado.kind === "fired" && resultado.context).toMatchObject({
      scope: AlertScope.CAMPAIGN,
      campaign: { campaignId: "camp_1", campaignName: "Leads — Busca" },
      current: { totals: totais(CPA_50) },
      previous: { totals: totais(CPA_25) },
    });
  });

  it("sobrevive a ida e volta por JSON", () => {
    const resultado = evaluateRule({
      rule: regra({ threshold: 4_500 }),
      target: null,
      current: janela(CPA_50),
      previous: janelaAnterior(CPA_25),
    });
    const contexto = resultado.kind === "fired" ? resultado.context : null;

    expect(JSON.parse(JSON.stringify(contexto))).toEqual(contexto);
  });
});

describe("fingerprintFor", () => {
  it("e estavel para a mesma condicao", () => {
    expect(fingerprintFor("regra_1", "camp_1", AlertDirection.ABOVE)).toBe(
      fingerprintFor("regra_1", "camp_1", AlertDirection.ABOVE),
    );
  });

  it("muda com a regra, com a campanha e com a direcao", () => {
    const base = fingerprintFor("regra_1", "camp_1", AlertDirection.ABOVE);

    expect(fingerprintFor("regra_2", "camp_1", AlertDirection.ABOVE)).not.toBe(base);
    expect(fingerprintFor("regra_1", "camp_2", AlertDirection.ABOVE)).not.toBe(base);
    expect(fingerprintFor("regra_1", null, AlertDirection.ABOVE)).not.toBe(base);
    expect(fingerprintFor("regra_1", "camp_1", AlertDirection.BELOW)).not.toBe(base);
  });
});

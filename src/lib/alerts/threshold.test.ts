import { describe, expect, it } from "vitest";
import { AlertComparison, AlertDirection, AlertMetric } from "@/generated/prisma/enums";
import {
  formatThresholdInput,
  formatThresholdValue,
  parseThresholdInput,
  thresholdAffix,
  thresholdUnit,
} from "./threshold";

const { ABSOLUTE_THRESHOLD, PCT_CHANGE } = AlertComparison;
const { ABOVE, BELOW } = AlertDirection;

function parse(
  metric: AlertMetric,
  comparison: AlertComparison,
  texto: string,
  direction: AlertDirection = ABOVE,
) {
  return parseThresholdInput(metric, comparison, direction, texto);
}

describe("thresholdUnit", () => {
  it("le variacao percentual como percentual em qualquer metrica", () => {
    expect(thresholdUnit(AlertMetric.CPA, PCT_CHANGE)).toBe("percent");
    expect(thresholdUnit(AlertMetric.ROAS, PCT_CHANGE)).toBe("percent");
  });

  it("herda a unidade da metrica em limiar absoluto", () => {
    expect(thresholdUnit(AlertMetric.CPA, ABSOLUTE_THRESHOLD)).toBe("currency");
    expect(thresholdUnit(AlertMetric.SPEND, ABSOLUTE_THRESHOLD)).toBe("currency");
    expect(thresholdUnit(AlertMetric.ROAS, ABSOLUTE_THRESHOLD)).toBe("ratio");
    expect(thresholdUnit(AlertMetric.FREQUENCY, ABSOLUTE_THRESHOLD)).toBe("ratio");
    expect(thresholdUnit(AlertMetric.CTR, ABSOLUTE_THRESHOLD)).toBe("percent");
  });
});

describe("thresholdAffix", () => {
  it("tira o simbolo da moeda da conta, e nao de um literal", () => {
    expect(thresholdAffix("currency", "BRL").prefix).toBe("R$");
    expect(thresholdAffix("currency", "USD").prefix).toBe("US$");
  });

  it("poe razao e percentual como sufixo", () => {
    expect(thresholdAffix("ratio", "BRL")).toEqual({ prefix: null, suffix: "×" });
    expect(thresholdAffix("percent", "BRL")).toEqual({ prefix: null, suffix: "%" });
  });
});

// O caso do enunciado da fase: a pessoa digita 45,00 e o banco guarda 4500.
describe("parseThresholdInput: dinheiro", () => {
  it("guarda centavos a partir de reais digitados", () => {
    expect(parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "45,00")).toEqual({
      ok: true,
      threshold: 4_500,
    });
  });

  it("aceita o valor sem casas decimais", () => {
    expect(parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "45")).toEqual({ ok: true, threshold: 4_500 });
  });

  it("aceita o separador de milhar do pt-BR", () => {
    expect(parse(AlertMetric.SPEND, ABSOLUTE_THRESHOLD, "1.500,50")).toEqual({
      ok: true,
      threshold: 150_050,
    });
    expect(parse(AlertMetric.SPEND, ABSOLUTE_THRESHOLD, "1.500")).toEqual({
      ok: true,
      threshold: 150_000,
    });
  });

  it("aceita o valor colado com simbolo e espaco", () => {
    expect(parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, " R$ 45,00 ")).toEqual({
      ok: true,
      threshold: 4_500,
    });
  });

  // "45.00" e ambiguo entre 45 e 4500, e as duas leituras sao defensaveis. Erro
  // que ensina custa uma correcao; adivinhar custa uma regra errada em producao.
  it("recusa o ponto como separador decimal", () => {
    const resultado = parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "45.00");
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.error.code).toBe("NAO_E_NUMERO");
  });
});

describe("parseThresholdInput: razao e percentual", () => {
  it("escala razao por cem", () => {
    expect(parse(AlertMetric.ROAS, ABSOLUTE_THRESHOLD, "2,50")).toEqual({
      ok: true,
      threshold: 250,
    });
  });

  it("escala percentual por cem", () => {
    expect(parse(AlertMetric.CTR, ABSOLUTE_THRESHOLD, "1,80")).toEqual({
      ok: true,
      threshold: 180,
    });
  });

  // A metrica e dinheiro, mas a comparacao e variacao: o campo passa a ser
  // percentual e o passo de centavos nao entra.
  it("le variacao percentual de metrica em dinheiro como percentual", () => {
    expect(parse(AlertMetric.CPA, PCT_CHANGE, "30,00")).toEqual({ ok: true, threshold: 3_000 });
  });
});

describe("parseThresholdInput: recusas", () => {
  it("recusa campo vazio", () => {
    const resultado = parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "   ");
    expect(!resultado.ok && resultado.error.code).toBe("VAZIO");
  });

  it("recusa texto que nao e numero", () => {
    const resultado = parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "quarenta");
    expect(!resultado.ok && resultado.error.code).toBe("NAO_E_NUMERO");
  });

  // Uma terceira casa nao cabe no inteiro guardado: arredondar em silencio
  // gravaria um limiar diferente do que a pessoa escreveu.
  it("recusa mais casas decimais do que o inteiro guarda", () => {
    const resultado = parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "45,005");
    expect(!resultado.ok && resultado.error.code).toBe("CASAS_DEMAIS");
  });

  it("recusa limiar zerado, que dispararia sempre", () => {
    const resultado = parse(AlertMetric.CPA, ABSOLUTE_THRESHOLD, "0,00");
    expect(!resultado.ok && resultado.error.code).toBe("NAO_POSITIVO");
  });

  it("recusa limiar que estoura a coluna", () => {
    const resultado = parse(AlertMetric.SPEND, ABSOLUTE_THRESHOLD, "999.999.999,00");
    expect(!resultado.ok && resultado.error.code).toBe("ALTO_DEMAIS");
  });

  // Queda de mais de 100% nao existe, e a regra ficaria configurada sem nunca
  // disparar -- que e o oposto silencioso da regra barulhenta.
  it("recusa queda percentual maior que o total", () => {
    const resultado = parse(AlertMetric.ROAS, PCT_CHANGE, "120,00", BELOW);
    expect(!resultado.ok && resultado.error.code).toBe("QUEDA_IMPOSSIVEL");
  });

  it("aceita alta percentual acima de cem, que acontece", () => {
    expect(parse(AlertMetric.CPA, PCT_CHANGE, "120,00", ABOVE)).toEqual({
      ok: true,
      threshold: 12_000,
    });
  });
});

// Ida e volta: o campo mostra exatamente o que, relido, produz o mesmo inteiro.
describe("formatThresholdInput", () => {
  it.each([
    [AlertMetric.CPA, ABSOLUTE_THRESHOLD, 4_500, "45,00"],
    [AlertMetric.SPEND, ABSOLUTE_THRESHOLD, 150_050, "1.500,50"],
    [AlertMetric.ROAS, ABSOLUTE_THRESHOLD, 250, "2,50"],
    [AlertMetric.CTR, ABSOLUTE_THRESHOLD, 180, "1,80"],
    [AlertMetric.CPA, PCT_CHANGE, 3_000, "30,00"],
  ])("%s/%s com limiar %i vira %s", (metric, comparison, threshold, esperado) => {
    expect(formatThresholdInput(metric, comparison, threshold)).toBe(esperado);
    expect(parse(metric, comparison, esperado)).toEqual({ ok: true, threshold });
  });
});

describe("formatThresholdValue", () => {
  it("escreve o limiar com o simbolo, para caber em prosa", () => {
    expect(formatThresholdValue(AlertMetric.CPA, ABSOLUTE_THRESHOLD, 6_000, "BRL")).toBe(
      "R$ 60,00",
    );
    expect(formatThresholdValue(AlertMetric.ROAS, ABSOLUTE_THRESHOLD, 250, "BRL")).toBe("2,50×");
    expect(formatThresholdValue(AlertMetric.CTR, ABSOLUTE_THRESHOLD, 180, "BRL")).toBe("1,80%");
    expect(formatThresholdValue(AlertMetric.CPA, PCT_CHANGE, 3_000, "BRL")).toBe("30,00%");
  });
});

import { describe, expect, it } from "vitest";
import {
  formatCount,
  formatCountCompact,
  formatCurrency,
  formatCurrencyCompact,
  formatDayLabel,
  formatDelta,
  formatDeltaPercent,
  formatMetric,
  formatPercent,
  formatRatio,
} from "./format";

// Intl separa simbolo de moeda e sufixo compacto com espaco inseparavel (U+00A0).
// Normalizar aqui deixa a expectativa legivel sem afrouxar o que esta sendo
// verificado: o que importa e o texto, nao qual dos dois espacos o ICU escolheu.
function normalize(value: string): string {
  return value.replaceAll(" ", " ");
}

describe("formatCurrency", () => {
  it("converte centavos para a unidade da moeda uma unica vez", () => {
    expect(normalize(formatCurrency(123_456, "BRL"))).toBe("R$ 1.234,56");
    expect(normalize(formatCurrency(0, "BRL"))).toBe("R$ 0,00");
  });

  it("respeita a moeda da conta, nao uma moeda fixa do painel", () => {
    expect(normalize(formatCurrency(123_456, "USD"))).toBe("US$ 1.234,56");
    expect(normalize(formatCurrency(123_456, "EUR"))).toBe("€ 1.234,56");
  });

  it("nao perde centavo em valor que nao e multiplo de cem", () => {
    expect(normalize(formatCurrency(1, "BRL"))).toBe("R$ 0,01");
    expect(normalize(formatCurrency(-4_599, "BRL"))).toBe("-R$ 45,99");
  });
});

describe("formatCurrencyCompact", () => {
  it("abrevia a ordem de grandeza", () => {
    expect(normalize(formatCurrencyCompact(1_234_560, "BRL"))).toBe("R$ 12,3 mil");
    expect(normalize(formatCurrencyCompact(123_456_780, "BRL"))).toBe("R$ 1,2 mi");
  });

  it("deixa valor pequeno inteiro, sem sufixo", () => {
    expect(normalize(formatCurrencyCompact(84_200, "BRL"))).toBe("R$ 842");
  });
});

describe("formatCount e formatCountCompact", () => {
  it("agrupa o numero exato e abrevia o compacto", () => {
    expect(formatCount(1_234_567)).toBe("1.234.567");
    expect(normalize(formatCountCompact(1_234_567))).toBe("1,2 mi");
    expect(normalize(formatCountCompact(12_345))).toBe("12,3 mil");
    expect(formatCountCompact(842)).toBe("842");
  });
});

describe("formatRatio e formatPercent", () => {
  it("marca a razao com o sinal de multiplicacao e o percentual com %", () => {
    expect(formatRatio(8)).toBe("8,00×");
    expect(formatRatio(3.14159, 1)).toBe("3,1×");
    expect(formatPercent(2.5)).toBe("2,50%");
    expect(formatPercent(2.5, 1)).toBe("2,5%");
  });
});

describe("formatDeltaPercent", () => {
  it("sempre mostra o sinal, para a direcao nao depender so da cor", () => {
    expect(formatDeltaPercent(12.34)).toBe("+12,3%");
    expect(formatDeltaPercent(-12.34)).toBe("-12,3%");
  });

  it("nao inventa sinal para variacao nula", () => {
    expect(formatDeltaPercent(0)).toBe("0,0%");
  });
});

describe("formatMetric", () => {
  it("mostra abreviado e guarda o valor exato para o title", () => {
    const gasto = formatMetric(123_456_780, "currency", "BRL");

    expect(normalize(gasto.display)).toBe("R$ 1,2 mi");
    expect(normalize(gasto.title)).toBe("R$ 1.234.567,80");
  });

  it("guarda mais casas no title do que na tela para razao e percentual", () => {
    expect(formatMetric(3.14159, "ratio", "BRL")).toEqual({
      display: "3,1×",
      title: "3,1416×",
    });
    expect(formatMetric(2.46913, "percent", "BRL")).toEqual({
      display: "2,5%",
      title: "2,4691%",
    });
  });

  it("mostra vazio, e nao zero, quando a metrica nao existe no periodo", () => {
    const semDado = formatMetric(null, "currency", "BRL");

    expect(semDado.display).toBe("—");
    expect(semDado.title).toBe("Sem dados no período");
  });
});

describe("formatDelta", () => {
  it("nomeia a base da comparacao no title", () => {
    expect(formatDelta(25)).toEqual({
      display: "+25,0%",
      title: "+25,0% vs. período anterior",
    });
  });

  it("nao mostra variacao quando nao ha base anterior", () => {
    expect(formatDelta(null)).toEqual({
      display: "—",
      title: "Sem período anterior comparável",
    });
  });
});

describe("formatDayLabel", () => {
  it("encurta a data ISO para dia e mes, sem passar por Date", () => {
    expect(formatDayLabel("2026-08-06")).toBe("06/08");
    expect(formatDayLabel("2026-01-31")).toBe("31/01");
  });
});

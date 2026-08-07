import { describe, expect, it } from "vitest";
import { trimToLastDataDay } from "./series";

function day(date: string, hasData: boolean, spendCents = 0) {
  return { date, hasData, spendCents };
}

describe("trimToLastDataDay", () => {
  it("corta os dias sem dado que sobram no fim do periodo", () => {
    const result = trimToLastDataDay([
      day("2026-08-03", true),
      day("2026-08-04", true),
      day("2026-08-05", false),
      day("2026-08-06", false),
    ]);

    expect(result.days.map((d) => d.date)).toEqual(["2026-08-03", "2026-08-04"]);
    expect(result.lastDataDate).toBe("2026-08-04");
    expect(result.trimmedDays).toBe(2);
  });

  // Zero medido e dado. Cortar aqui apagaria um dia que a conta viveu de verdade.
  it("nao corta dia medido so porque o valor dele e zero", () => {
    const result = trimToLastDataDay([
      day("2026-08-03", true, 5_000),
      day("2026-08-04", true, 0),
    ]);

    expect(result.days.map((d) => d.date)).toEqual(["2026-08-03", "2026-08-04"]);
    expect(result.lastDataDate).toBe("2026-08-04");
    expect(result.trimmedDays).toBe(0);
  });

  // Buraco no meio nao e o mesmo problema: cortar ali encurtaria a serie inteira
  // por causa de um dia, e o eixo deixaria de ser um calendario continuo.
  it("preserva lacuna no meio da serie, cortando so o rabo", () => {
    const result = trimToLastDataDay([
      day("2026-08-01", true),
      day("2026-08-02", false),
      day("2026-08-03", true),
      day("2026-08-04", false),
    ]);

    expect(result.days.map((d) => d.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
    expect(result.lastDataDate).toBe("2026-08-03");
    expect(result.trimmedDays).toBe(1);
  });

  it("devolve serie vazia quando nenhum dia do periodo foi medido", () => {
    const result = trimToLastDataDay([day("2026-08-05", false), day("2026-08-06", false)]);

    expect(result.days).toEqual([]);
    expect(result.lastDataDate).toBeNull();
    expect(result.trimmedDays).toBe(2);
  });

  it("nao mexe na serie que termina em dia medido", () => {
    const days = [day("2026-08-05", true), day("2026-08-06", true)];
    const result = trimToLastDataDay(days);

    expect(result.days).toEqual(days);
    expect(result.lastDataDate).toBe("2026-08-06");
    expect(result.trimmedDays).toBe(0);
  });

  it("aguenta serie vazia", () => {
    expect(trimToLastDataDay([])).toEqual({ days: [], lastDataDate: null, trimmedDays: 0 });
  });
});

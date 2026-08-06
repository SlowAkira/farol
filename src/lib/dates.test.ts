import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, todayIn } from "./dates";

describe("isIsoDate", () => {
  it("aceita data real e recusa data que so parece valida", () => {
    expect(isIsoDate("2026-08-06")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);

    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("06/08/2026")).toBe(false);
    expect(isIsoDate("2026-8-6")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("addDays", () => {
  it("atravessa mes, ano e ano bissexto", () => {
    expect(addDays("2026-08-06", -1)).toBe("2026-08-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("cobre a janela padrao de 28 dias", () => {
    expect(addDays("2026-08-06", -28)).toBe("2026-07-09");
  });

  it("recusa data invalida em vez de deslizar em silencio", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow(RangeError);
  });
});

describe("todayIn", () => {
  // 03:00 UTC ainda e o dia anterior em Sao Paulo (UTC-3). Usar o dia do servidor
  // deslocaria a janela inteira justamente nas execucoes de madrugada.
  it("devolve o dia da conta, nao o do servidor", () => {
    const madrugada = new Date("2026-08-06T02:30:00Z");

    expect(todayIn("UTC", madrugada)).toBe("2026-08-06");
    expect(todayIn("America/Sao_Paulo", madrugada)).toBe("2026-08-05");
    expect(todayIn("Asia/Tokyo", madrugada)).toBe("2026-08-06");
  });

  it("mantem o formato YYYY-MM-DD com mes e dia de um digito", () => {
    expect(todayIn("UTC", new Date("2026-01-02T12:00:00Z"))).toBe("2026-01-02");
  });

  it("derruba com fuso inexistente", () => {
    expect(() => todayIn("Marte/Olympus")).toThrow(RangeError);
  });
});

import { describe, expect, it } from "vitest";
import { addDays, todayIn } from "@/lib/dates";
import { periodAnchor, periodForPreset, resolvePeriod } from "./search-params";

const ULTIMO_DIA = "2026-06-09";

describe("periodAnchor", () => {
  it("termina no ultimo dia medido da conta, e nao no calendario", () => {
    expect(periodAnchor(ULTIMO_DIA)).toBe(ULTIMO_DIA);
  });

  it("cai em ontem quando a conta ainda nao tem dia medido", () => {
    expect(periodAnchor(null)).toBe(addDays(todayIn("UTC"), -1));
  });
});

describe("periodForPreset", () => {
  // O bug que originou isto: "7 dias" ancorado em hoje pedia sete dias e recebia
  // os tres que a ingestao ja tinha alcancado. A contagem so fecha se o proprio
  // dia da ancora contar.
  it("conta a ancora como um dos dias do preset", () => {
    expect(periodForPreset(7, ULTIMO_DIA)).toEqual({
      since: "2026-06-03",
      until: ULTIMO_DIA,
    });
    expect(periodForPreset(30, ULTIMO_DIA)).toEqual({
      since: "2026-05-11",
      until: ULTIMO_DIA,
    });
  });
});

describe("resolvePeriod", () => {
  it("usa o periodo da URL quando ele e valido, ignorando a ancora", () => {
    expect(
      resolvePeriod({ since: "2026-01-01", until: "2026-01-31" }, ULTIMO_DIA),
    ).toEqual({ since: "2026-01-01", until: "2026-01-31" });
  });

  it.each([
    ["sem parametro", {}],
    ["so um dos dois", { since: "2026-01-01" }],
    ["data que nao existe", { since: "2026-02-30", until: "2026-03-05" }],
    ["fora do formato", { since: "01/01/2026", until: "31/01/2026" }],
    ["invertido", { since: "2026-03-05", until: "2026-01-01" }],
  ])("cai no preset padrao ancorado quando a URL traz %s", (_caso, params) => {
    expect(resolvePeriod(params, ULTIMO_DIA)).toEqual(periodForPreset(7, ULTIMO_DIA));
  });

  it("nunca termina depois da ancora", () => {
    const { until } = resolvePeriod(new URLSearchParams(), ULTIMO_DIA);
    expect(until <= ULTIMO_DIA).toBe(true);
  });
});

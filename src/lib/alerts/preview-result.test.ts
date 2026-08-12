import { describe, expect, it } from "vitest";
import { backtestVerdict } from "./preview-result";

describe("backtestVerdict", () => {
  it("chama de cega a simulacao sem nenhum dia mensuravel", () => {
    expect(backtestVerdict(0, 0)).toBe("cega");
  });

  // Zero disparo com dia medido e regra quieta; zero disparo sem dia medido e
  // regra que nunca teve como falar. A tela precisa dizer coisas diferentes.
  it("separa regra quieta de regra cega", () => {
    expect(backtestVerdict(0, 90)).toBe("silenciosa");
  });

  it("aceita ate um disparo por semana de historico medido", () => {
    expect(backtestVerdict(12, 90)).toBe("saudavel");
    expect(backtestVerdict(13, 90)).toBe("barulhenta");
  });

  it("julga pela proporcao, e nao por uma contagem fixa", () => {
    // Os mesmos 4 disparos: saudaveis em 90 dias, barulhentos em 20.
    expect(backtestVerdict(4, 90)).toBe("saudavel");
    expect(backtestVerdict(4, 20)).toBe("barulhenta");
  });
});

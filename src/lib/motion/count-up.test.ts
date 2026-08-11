import { describe, expect, it } from "vitest";
import { countUpValue, easeOutCubic, parseCssDuration } from "./count-up";

const DURACAO = 600;

describe("easeOutCubic", () => {
  it("vai de zero a um", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
  });

  it("satura fora do intervalo", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(2)).toBe(1);
  });

  it("desacelera: passa da metade antes do meio do tempo", () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("countUpValue", () => {
  it("comeca em zero", () => {
    expect(countUpValue(1200, 0, DURACAO)).toBe(0);
  });

  it("termina exatamente no alvo", () => {
    expect(countUpValue(1200, DURACAO, DURACAO)).toBe(1200);
  });

  it("satura depois da duracao", () => {
    expect(countUpValue(1200, DURACAO * 3, DURACAO)).toBe(1200);
  });

  // Numero que anda para tras no meio da contagem le como erro de leitura, nao
  // como animacao.
  it("nunca anda para tras", () => {
    let anterior = -1;
    for (let decorrido = 0; decorrido <= DURACAO; decorrido += 10) {
      const atual = countUpValue(1200, decorrido, DURACAO);
      expect(atual).toBeGreaterThanOrEqual(anterior);
      anterior = atual;
    }
  });

  it("conta para baixo quando o alvo e negativo", () => {
    expect(countUpValue(-50, DURACAO / 2, DURACAO)).toBeLessThan(0);
    expect(countUpValue(-50, DURACAO, DURACAO)).toBe(-50);
  });

  // Duracao zero e o caminho de movimento reduzido: sem animacao, o valor final
  // desde o primeiro quadro.
  it("entrega o alvo direto quando a duracao e zero", () => {
    expect(countUpValue(1200, 0, 0)).toBe(1200);
  });
});

describe("parseCssDuration", () => {
  it("le milissegundos", () => {
    expect(parseCssDuration("600ms", 0)).toBe(600);
    expect(parseCssDuration("  220ms  ", 0)).toBe(220);
  });

  it("converte segundos", () => {
    expect(parseCssDuration("1.5s", 0)).toBe(1500);
  });

  // Token ausente chega como string vazia do getComputedStyle: cai no padrao em
  // vez de virar NaN e parar a contagem no meio.
  it("cai no padrao quando o token nao existe", () => {
    expect(parseCssDuration("", 600)).toBe(600);
    expect(parseCssDuration("herdado", 600)).toBe(600);
  });
});

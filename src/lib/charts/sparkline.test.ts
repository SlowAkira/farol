import { describe, expect, it } from "vitest";
import { sparklineGeometry } from "./sparkline";

const OPTIONS = { width: 100, height: 20, padding: 2 } as const;

describe("sparklineGeometry", () => {
  it("espalha os pontos pela largura util e inverte o eixo vertical", () => {
    const geometry = sparklineGeometry([0, 1, 2], OPTIONS);

    // Maior valor no topo (y menor), menor no fundo: em SVG o y cresce para baixo.
    expect(geometry?.paths).toEqual(["M2,18L50,10L98,2"]);
  });

  it("escala pela amplitude da propria serie, nao a partir do zero", () => {
    const geometry = sparklineGeometry([100, 101], OPTIONS);

    expect(geometry?.paths).toEqual(["M2,18L98,2"]);
  });

  it("põe serie constante na altura do meio, sem sugerir maximo nem minimo", () => {
    const geometry = sparklineGeometry([7, 7, 7], OPTIONS);

    expect(geometry?.paths).toEqual(["M2,10L50,10L98,10"]);
  });

  it("interrompe a linha no dia sem valor em vez de interpolar por cima dele", () => {
    const geometry = sparklineGeometry([0, 1, null, 1, 0], OPTIONS);

    expect(geometry?.paths).toEqual(["M2,18L26,2", "M74,2L98,18"]);
  });

  it("desenha ponto isolado como segmento de comprimento zero", () => {
    const geometry = sparklineGeometry([null, 5, null], OPTIONS);

    expect(geometry?.paths).toEqual(["M50,10L50,10"]);
  });

  it("marca o ultimo dia com valor, ignorando os nulos do fim", () => {
    const geometry = sparklineGeometry([0, 2, 1, null], OPTIONS);

    expect(geometry?.lastPoint).toEqual({ x: 66, y: 10 });
  });

  it("centraliza a serie de um unico ponto", () => {
    const geometry = sparklineGeometry([3], OPTIONS);

    expect(geometry?.paths).toEqual(["M50,10L50,10"]);
    expect(geometry?.lastPoint).toEqual({ x: 50, y: 10 });
  });

  it("devolve null quando nao ha nenhum valor para desenhar", () => {
    expect(sparklineGeometry([], OPTIONS)).toBeNull();
    expect(sparklineGeometry([null, null], OPTIONS)).toBeNull();
  });

  it("mantem o desenho dentro do viewBox, respeitando a folga", () => {
    const geometry = sparklineGeometry([5, 40, 12, 30], OPTIONS);
    const coordinates = geometry!.paths.join("").matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g);

    for (const [, x, y] of coordinates) {
      expect(Number(x)).toBeGreaterThanOrEqual(OPTIONS.padding);
      expect(Number(x)).toBeLessThanOrEqual(OPTIONS.width - OPTIONS.padding);
      expect(Number(y)).toBeGreaterThanOrEqual(OPTIONS.padding);
      expect(Number(y)).toBeLessThanOrEqual(OPTIONS.height - OPTIONS.padding);
    }
  });
});

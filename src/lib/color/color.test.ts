import { describe, expect, it } from "vitest";
import { composite, contrastRatio, relativeLuminance } from "./contrast";
import { simulateDichromacy } from "./cvd";
import { deltaE, parseColor, toLab } from "./space";

function rgb(css: string) {
  const parsed = parseColor(css);
  if (!parsed) {
    throw new Error(`Cor "${css}" nao foi reconhecida pelo parser.`);
  }
  return parsed.rgb;
}

describe("parseColor", () => {
  it("le hex de 3, 6 e 8 digitos", () => {
    expect(rgb("#fff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(rgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(parseColor("#00000080")?.alpha).toBeCloseTo(0.502, 2);
  });

  // Os tokens do shadcn vem em oklch e os da marca em hex; o auditor precisa
  // comparar os dois no mesmo espaco, entao a conversao tem que bater com o que
  // o navegador desenha.
  it("converte oklch neutro para o cinza equivalente do Tailwind", () => {
    // oklch(0.556 0 0) e neutral-500 (#737373); oklch(1 0 0) e branco.
    expect(rgb("oklch(1 0 0)").r).toBeCloseTo(1, 3);
    const neutral500 = rgb("oklch(0.556 0 0)");
    expect(neutral500.r * 255).toBeCloseTo(115, 0);
    expect(neutral500.r).toBeCloseTo(neutral500.g, 6);
    expect(neutral500.b).toBeCloseTo(neutral500.g, 6);
  });

  it("le a opacidade de oklch(... / 10%)", () => {
    expect(parseColor("oklch(1 0 0 / 10%)")?.alpha).toBeCloseTo(0.1, 6);
  });

  it("devolve nulo em vez de lancar para sintaxe que nao suporta", () => {
    expect(parseColor("rgb(1 2 3)")).toBeNull();
    expect(parseColor("var(--primary)")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("vai de 21:1 no par extremo a 1:1 na cor consigo mesma", () => {
    expect(contrastRatio(rgb("#000"), rgb("#fff"))).toBeCloseTo(21, 5);
    expect(contrastRatio(rgb("#7c3aed"), rgb("#7c3aed"))).toBeCloseTo(1, 6);
  });

  it("nao depende da ordem dos argumentos", () => {
    const a = rgb("#15803d");
    const b = rgb("#ffffff");
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 9);
  });

  // Valor de referencia conferido contra a formula da WCAG: se a luminancia
  // relativa mudar, este numero denuncia.
  it("reproduz o contraste conhecido do roxo da marca sobre branco", () => {
    expect(contrastRatio(rgb("#7c3aed"), rgb("#ffffff"))).toBeCloseTo(5.7, 1);
  });

  it("mede luminancia crescente do preto ao branco", () => {
    expect(relativeLuminance(rgb("#000"))).toBeCloseTo(0, 6);
    expect(relativeLuminance(rgb("#fff"))).toBeCloseTo(1, 6);
  });
});

describe("composite", () => {
  it("com opacidade 1 devolve a cor de cima e com 0 a de baixo", () => {
    const frente = rgb("#7c3aed");
    const fundo = rgb("#ffffff");
    expect(composite(frente, 1, fundo)).toEqual(frente);
    expect(composite(frente, 0, fundo)).toEqual(fundo);
  });

  it("a 10% fica muito mais perto do fundo", () => {
    const misturado = composite(rgb("#000000"), 0.1, rgb("#ffffff"));
    expect(misturado.r).toBeCloseTo(0.9, 6);
  });
});

describe("simulateDichromacy", () => {
  // Cinza nao tem componente vermelho-verde para perder: se a simulacao mexer
  // nele, a matriz de ida ou a inversa esta errada.
  it("deixa cinza e branco praticamente intactos", () => {
    for (const tom of ["#ffffff", "#808080", "#171717"]) {
      for (const tipo of ["protanopia", "deuteranopia"] as const) {
        expect(deltaE(rgb(tom), simulateDichromacy(rgb(tom), tipo))).toBeLessThan(2);
      }
    }
  });

  // O caso classico: vermelho e verde saturados sao facilmente distintos na
  // visao normal e colapsam um sobre o outro na deuteranopia.
  it("aproxima vermelho e verde que a visao normal separa", () => {
    const vermelho = rgb("#d62728");
    const verde = rgb("#2ca02c");

    const normal = deltaE(vermelho, verde);
    const simulado = deltaE(
      simulateDichromacy(vermelho, "deuteranopia"),
      simulateDichromacy(verde, "deuteranopia"),
    );

    expect(normal).toBeGreaterThan(60);
    expect(simulado).toBeLessThan(normal / 2);
  });

  it("preserva o eixo azul-amarelo, que o dicromata continua enxergando", () => {
    const azul = rgb("#2a78d6");
    const laranja = rgb("#eb6834");

    expect(
      deltaE(
        simulateDichromacy(azul, "deuteranopia"),
        simulateDichromacy(laranja, "deuteranopia"),
      ),
    ).toBeGreaterThan(20);
  });
});

describe("toLab", () => {
  it("poe branco e preto nos extremos da luminosidade", () => {
    expect(toLab(rgb("#ffffff")).l).toBeCloseTo(100, 1);
    expect(toLab(rgb("#000000")).l).toBeCloseTo(0, 1);
  });
});

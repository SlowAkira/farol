import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readFontSizeTokens } from "./scale";

// Mesma ideia do teste de contraste: le o CSS de verdade, entao "no maximo seis
// tamanhos" e uma regra que o CI cobra, e nao uma frase no CLAUDE.md que a
// proxima tela contraria sem ninguem perceber.
const TAMANHO_MAXIMO = 6;

describe("readFontSizeTokens", () => {
  it("lista cada tamanho uma vez", () => {
    expect(readFontSizeTokens("--text-body: 1rem; --text-lead: 2rem;")).toEqual([
      "--text-body",
      "--text-lead",
    ]);
  });

  it("nao conta o entrelinha como tamanho novo", () => {
    expect(
      readFontSizeTokens("--text-body: 1rem; --text-body--line-height: 1.5rem;"),
    ).toEqual(["--text-body"]);
  });

  it("ignora tamanho citado em comentario", () => {
    expect(readFontSizeTokens("/* --text-antigo: 3rem; */ --text-body: 1rem;")).toEqual([
      "--text-body",
    ]);
  });
});

describe("escala tipografica do tema", () => {
  it(`declara no maximo ${TAMANHO_MAXIMO} tamanhos`, () => {
    const tamanhos = readFontSizeTokens(readFileSync("src/app/globals.css", "utf8"));

    expect(tamanhos, tamanhos.join(", ")).toHaveLength(TAMANHO_MAXIMO);
  });
});

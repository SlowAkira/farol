import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Ativo binario de verdade versionado em src/. Qualquer arquivo novo que caia
// aqui tem que ser adicionado de proposito: a lista existe para que binario
// entre por decisao, e nao porque o teste foi afrouxado.
const BINARIOS_CONHECIDOS = new Set(["src/app/favicon.ico"]);

function arquivosVersionados(): string[] {
  return execFileSync("git", ["ls-files", "--", "src"], { encoding: "utf8" })
    .split("\n")
    .filter((linha) => linha.length > 0);
}

describe("bytes dos fontes versionados", () => {
  // Um unico byte NUL faz o git tratar o arquivo inteiro como binario: some o
  // diff por linha, some o merge e o arquivo fica ilegivel em review. Aconteceu
  // com src/lib/ingestion/sync.ts, onde o separador de uma chave composta saiu
  // como U+0000 em vez de "|" -- tsc, eslint e os testes passaram sem notar,
  // porque em runtime nao havia defeito nenhum.
  it("nao tem byte NUL fora dos binarios conhecidos", () => {
    const comNul = arquivosVersionados()
      .filter((arquivo) => !BINARIOS_CONHECIDOS.has(arquivo))
      .filter((arquivo) => readFileSync(arquivo).includes(0));

    expect(comNul).toEqual([]);
  });

  // Se o favicon sumir ou for trocado por SVG, a entrada acima vira letra morta
  // e ninguem percebe. Melhor a lista falhar quando deixar de descrever o repo.
  it("mantem a lista de binarios conhecidos condizente com o repo", () => {
    const versionados = new Set(arquivosVersionados());

    for (const arquivo of BINARIOS_CONHECIDOS) {
      expect(versionados, `${arquivo} saiu do repo`).toContain(arquivo);
      expect(readFileSync(arquivo).includes(0), `${arquivo} nao e mais binario`).toBe(true);
    }
  });
});

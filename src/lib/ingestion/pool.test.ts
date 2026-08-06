import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./pool";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("mapWithConcurrency", () => {
  // O resumo por conta e lido posicionalmente contra a lista pedida; se a ordem
  // seguisse a de conclusao, a conta mais lenta apareceria com o numero de outra.
  it("devolve resultados na ordem da entrada, nao na de conclusao", async () => {
    const result = await mapWithConcurrency([30, 0, 20, 5], 2, async (ms, index) => {
      await sleep(ms);
      return `${index}:${ms}`;
    });

    expect(result).toEqual(["0:30", "1:0", "2:20", "3:5"]);
  });

  it("nunca passa do limite de tarefas em voo", async () => {
    let inFlight = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), 3, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(2);
      inFlight -= 1;
      return item;
    });

    expect(peak).toBe(3);
  });

  it("nao cria runner ocioso quando o limite passa do tamanho da lista", async () => {
    let inFlight = 0;
    let peak = 0;

    const result = await mapWithConcurrency(["a", "b"], 10, async (item) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await sleep(2);
      inFlight -= 1;
      return item.toUpperCase();
    });

    expect(result).toEqual(["A", "B"]);
    expect(peak).toBe(2);
  });

  it("nao chama o worker com lista vazia", async () => {
    let calls = 0;

    const result = await mapWithConcurrency([], 3, async (item: number) => {
      calls += 1;
      return item;
    });

    expect(result).toEqual([]);
    expect(calls).toBe(0);
  });
});

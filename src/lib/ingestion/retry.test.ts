import { describe, expect, it, vi } from "vitest";
import { NotImplementedError, TransientProviderError, UnknownAccountError } from "@/lib/providers";
import { backoffMs, DEFAULT_ATTEMPTS, DEFAULT_BASE_MS, withRetry } from "./retry";

function recorder() {
  const delays: number[] = [];
  return {
    delays,
    sleep: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

describe("backoffMs", () => {
  it("dobra a cada tentativa", () => {
    const noJitter = () => 0;

    expect(backoffMs(1, DEFAULT_BASE_MS, noJitter)).toBe(250);
    expect(backoffMs(2, DEFAULT_BASE_MS, noJitter)).toBe(500);
    expect(backoffMs(3, DEFAULT_BASE_MS, noJitter)).toBe(1_000);
  });

  // Com jitter total o sorteio pode devolver quase zero e a segunda tentativa sai
  // colada na primeira, que e o oposto do que o backoff quer.
  it("mantem o jitter dentro da metade superior do intervalo", () => {
    for (const random of [() => 0, () => 0.5, () => 0.999]) {
      const delay = backoffMs(2, DEFAULT_BASE_MS, random);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1_000);
    }
  });
});

describe("withRetry", () => {
  it("nao dorme quando a primeira tentativa passa", async () => {
    const { delays, sleep } = recorder();
    const operation = vi.fn(() => Promise.resolve("ok"));

    await expect(withRetry(operation, { sleep })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("supera erro transitorio e devolve o valor da tentativa que passou", async () => {
    const { delays, sleep } = recorder();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new TransientProviderError("rate limit"))
      .mockRejectedValueOnce(new TransientProviderError("rate limit"))
      .mockResolvedValue("ok");

    await expect(withRetry(operation, { sleep, random: () => 0 })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([250, 500]);
  });

  it("relanca o ultimo erro depois de esgotar as tentativas", async () => {
    const { delays, sleep } = recorder();
    const last = new TransientProviderError("terceira");
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValueOnce(new TransientProviderError("primeira"))
      .mockRejectedValueOnce(new TransientProviderError("segunda"))
      .mockRejectedValue(last);

    await expect(withRetry(operation, { sleep, random: () => 0 })).rejects.toBe(last);
    expect(operation).toHaveBeenCalledTimes(DEFAULT_ATTEMPTS);
    expect(delays).toHaveLength(DEFAULT_ATTEMPTS - 1);
  });

  // Token expirado e conta desconhecida nao melhoram na segunda tentativa:
  // repetir so atrasa o diagnostico e gasta cota da plataforma.
  it("nao repete erro que nao seja transitorio", async () => {
    for (const error of [new UnknownAccountError("act_1"), new NotImplementedError("x"), new TypeError("bug")]) {
      const { delays, sleep } = recorder();
      const operation = vi.fn<() => Promise<never>>().mockRejectedValue(error);

      await expect(withRetry(operation, { sleep })).rejects.toBe(error);
      expect(operation).toHaveBeenCalledTimes(1);
      expect(delays).toEqual([]);
    }
  });

  it("respeita um numero de tentativas customizado", async () => {
    const { sleep } = recorder();
    const operation = vi
      .fn<() => Promise<never>>()
      .mockRejectedValue(new TransientProviderError("sempre"));

    await expect(
      withRetry(operation, { sleep, attempts: 5, random: () => 0 }),
    ).rejects.toBeInstanceOf(TransientProviderError);
    expect(operation).toHaveBeenCalledTimes(5);
  });
});

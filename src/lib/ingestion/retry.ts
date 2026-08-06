import { TransientProviderError } from "@/lib/providers";

export const DEFAULT_ATTEMPTS = 3;
export const DEFAULT_BASE_MS = 500;

export type RetryPolicy = {
  readonly attempts: number;
  readonly baseMs: number;
  readonly random: () => number;
  readonly sleep: (ms: number) => Promise<void>;
};

function realSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Jitter pela metade, nao inteiro: com jitter total o sorteio pode devolver quase
// zero e a segunda tentativa sai junto da primeira, que e exatamente o que o
// backoff existe para evitar quando a plataforma esta rate-limitando.
export function backoffMs(attempt: number, baseMs: number, random: () => number): number {
  const delay = baseMs * 2 ** (attempt - 1);
  return Math.round(delay / 2 + random() * (delay / 2));
}

// So repete TransientProviderError. Erro de configuracao, conta desconhecida ou
// token expirado nao melhoram na segunda tentativa: repetir so atrasa o
// diagnostico e triplica a chamada cobrada.
export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: Partial<RetryPolicy> = {},
): Promise<T> {
  const {
    attempts = DEFAULT_ATTEMPTS,
    baseMs = DEFAULT_BASE_MS,
    random = Math.random,
    sleep = realSleep,
  } = policy;

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof TransientProviderError) || attempt >= attempts) {
        throw error;
      }

      await sleep(backoffMs(attempt, baseMs, random));
    }
  }
}

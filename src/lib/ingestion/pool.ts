// Disparar todas as contas de uma vez estouraria o rate limit da plataforma e o
// teto de conexoes do Postgres junto. Runners consumindo um indice compartilhado,
// e nao lotes de tamanho fixo: com lote, uma conta lenta segura as outras duas
// vagas ate o lote inteiro terminar.
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  // O worker precisa ser total. Se ele rejeitar, o Promise.all abaixo rejeita no
  // primeiro erro e os runners restantes seguem rodando sem ninguem esperando
  // por eles -- quem garante isso e o try/catch de syncOneAccount.
  async function run(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, run);
  await Promise.all(runners);

  return results;
}

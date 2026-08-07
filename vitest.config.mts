import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    globalSetup: ["src/test/global-setup.ts"],
    // Arquivo de teste de banco nao roda em paralelo com outro. O proxy de
    // `prisma dev` recicla a sessao do backend entre conexoes (mesmo motivo do
    // SET LOCAL em src/test/db.ts), e com dois arquivos consultando ao mesmo
    // tempo o protocolo dessincroniza: o bind de uma query chega no prepared
    // statement da outra e o Postgres devolve 08P01 ("bind message supplies N
    // parameters, but prepared statement requires M") em query que nao tem
    // defeito nenhum -- falha que muda de arquivo a cada execucao e nao se
    // reproduz rodando o teste sozinho. O schema por worker isola os dados, nao
    // a sessao; quem isola a sessao e rodar em serie.
    fileParallelism: false,
    // Criar o schema do worker e replayar as migracoes acontece em beforeAll, e o
    // padrao de 10s do Vitest e apertado para isso somado ao backoff do retry.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});

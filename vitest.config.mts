import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    globalSetup: ["src/test/global-setup.ts"],
    // Criar o schema do worker e replayar as migracoes acontece em beforeAll, e o
    // padrao de 10s do Vitest e apertado para isso somado ao backoff do retry.
    hookTimeout: 30_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});

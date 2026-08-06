import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Em dev o Next recarrega o modulo a cada edicao. Sem guardar a instancia no
// globalThis, cada recarga abriria um pool novo e o Postgres derrubaria a
// conexao por limite muito antes de alguem notar o vazamento.
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL nao esta definida.");
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// process.env lido dentro da funcao, e nao no topo do modulo: no topo o valor
// seria congelado no `next build` em vez de valer o do ambiente de execucao.
export function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (existing) {
    return existing;
  }

  const client = createClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }

  return client;
}

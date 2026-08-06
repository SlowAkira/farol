import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Client } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

export const SCHEMA_PREFIX = "farol_test_";

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

// Ordem de truncate irrelevante por causa do CASCADE, mas a lista explicita e
// proposital: tabela nova que ninguem lembrar de adicionar aqui vai vazar estado
// entre testes, e e melhor descobrir isso lendo esta linha do que caçando um
// teste que so falha quando roda depois de outro.
const TABLES = ["DailyInsight", "Campaign", "AdAccount", "User"] as const;

export function testConnectionString(): string {
  const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "Os testes de banco precisam de TEST_DATABASE_URL (ou DATABASE_URL). Suba o banco local com `npx prisma dev`.",
    );
  }
  return url;
}

// Um schema por worker do Vitest: os arquivos de teste continuam rodando em
// paralelo sem que o TRUNCATE de um apague as linhas do outro.
export function testSchemaName(): string {
  return `${SCHEMA_PREFIX}${process.env.VITEST_POOL_ID ?? "1"}`;
}

async function migrationScripts(): Promise<string[]> {
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    directories.map((name) =>
      readFile(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    ),
  );
}

export type TestDatabase = {
  readonly prisma: PrismaClient;
  readonly schema: string;
  readonly close: () => Promise<void>;
};

// Replay das migracoes reais em vez de `db push`: o schema do teste nao pode
// divergir do que vai rodar em producao, e o SQL gerado pelo Prisma e todo sem
// qualificacao de schema, entao cai no schema do search_path desta conexao.
export async function createTestDatabase(): Promise<TestDatabase> {
  const connectionString = testConnectionString();
  const schema = testSchemaName();

  if (!schema.startsWith(SCHEMA_PREFIX)) {
    throw new Error(`Schema de teste invalido: "${schema}".`);
  }

  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.query(`CREATE SCHEMA "${schema}"`);

    // SET LOCAL dentro de transacao, nunca SET solto: o proxy de `npx prisma dev`
    // recicla a sessao do backend entre conexoes, entao um search_path de sessao
    // vaza para a proxima conexao -- inclusive a do app, que passaria a apontar
    // para um schema de teste ja derrubado. Com SET LOCAL o valor morre no commit.
    await admin.query("BEGIN");
    try {
      await admin.query(`SET LOCAL search_path TO "${schema}"`);
      for (const script of await migrationScripts()) {
        await admin.query(script);
      }
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
  } finally {
    await admin.end();
  }

  // `schema` faz o Prisma qualificar toda query gerada com o schema do worker.
  // Nenhuma escrita de src/lib/ingestion usa SQL cru justamente para nao depender
  // do search_path da sessao, que esta qualificacao nao alcanca.
  //
  // `max` baixo de proposito: a URL de `npx prisma dev` vem com connection_limit=10
  // para o banco inteiro, e os workers do Vitest dividem esse teto entre si. Com o
  // padrao do pg (10 por pool) dois workers ja estouram e o servidor local trava.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 2 }, { schema }),
  });

  return {
    prisma,
    schema,
    close: async () => {
      await prisma.$disconnect();
      await dropSchema(connectionString, schema);
    },
  };
}

export async function resetTables(database: TestDatabase): Promise<void> {
  const list = TABLES.map((table) => `"${database.schema}"."${table}"`).join(", ");
  await database.prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export async function dropSchema(connectionString: string, schema: string): Promise<void> {
  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  } finally {
    await admin.end();
  }
}

// Conexoes que ficaram em "idle in transaction" sao o sintoma de transacao aberta
// que ninguem fechou: o teste de erro persistente confere isso apos a falha.
export async function idleInTransactionCount(): Promise<number> {
  const admin = new Client({ connectionString: testConnectionString() });
  await admin.connect();
  try {
    const result = await admin.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM pg_stat_activity WHERE state = 'idle in transaction'",
    );
    return Number(result.rows[0]?.count ?? "0");
  } finally {
    await admin.end();
  }
}

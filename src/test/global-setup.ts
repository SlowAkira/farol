import "dotenv/config";
import { Client } from "pg";
import { SCHEMA_PREFIX, testConnectionString } from "./db";

// O Vitest nao popula process.env a partir do .env sozinho, so expoe o que tem
// prefixo do Vite em import.meta.env. Sem o dotenv acima, DATABASE_URL chegaria
// vazia nos testes de banco e a falha apareceria como "conexao recusada".
export async function setup(): Promise<void> {
  const connectionString = testConnectionString();

  const admin = new Client({ connectionString });
  await admin.connect();
  try {
    // Execucao interrompida (Ctrl+C, worker morto) deixa o schema para tras.
    // Varre antes de comecar para o banco de dev nao acumular farol_test_*.
    const leftovers = await admin.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE $1",
      [`${SCHEMA_PREFIX}%`],
    );

    for (const { nspname } of leftovers.rows) {
      await admin.query(`DROP SCHEMA IF EXISTS "${nspname}" CASCADE`);
    }
  } finally {
    await admin.end();
  }
}

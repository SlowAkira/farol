import "dotenv/config";
import { getPrisma } from "@/lib/db/client";
import { syncOneAccount } from "@/lib/ingestion/run";

const USAGE = "uso: npm run sync -- <adAccountId> [--lookback <dias>]";

type ParsedArgs =
  | { readonly ok: true; readonly adAccountId: string; readonly lookbackDays?: number }
  | { readonly ok: false; readonly message: string };

function parseArgs(argv: readonly string[]): ParsedArgs {
  let adAccountId: string | undefined;
  let lookbackDays: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--lookback") {
      index += 1;
      const raw: string | undefined = argv[index];
      const parsed = Number(raw);

      if (raw === undefined || !Number.isInteger(parsed) || parsed < 1) {
        return {
          ok: false,
          message: `--lookback espera um inteiro maior que zero, recebido: ${raw ?? "nada"}.`,
        };
      }

      lookbackDays = parsed;
      continue;
    }

    if (adAccountId !== undefined) {
      return { ok: false, message: `argumento inesperado: ${arg}` };
    }

    adAccountId = arg;
  }

  if (adAccountId === undefined) {
    return { ok: false, message: "informe o id da conta." };
  }

  return { ok: true, adAccountId, lookbackDays };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.ok) {
    console.error(`${parsed.message}\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  try {
    const outcome = await syncOneAccount(parsed.adAccountId, {
      trigger: "cli",
      lookbackDays: parsed.lookbackDays,
    });

    if (!outcome.ok) {
      process.exitCode = 1;
    }
  } finally {
    // O pool do Prisma segura o event loop aberto: sem o disconnect o processo
    // fica pendurado depois de ja ter impresso a linha de log.
    await getPrisma().$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

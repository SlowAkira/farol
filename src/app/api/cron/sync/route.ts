import { timingSafeEqual } from "node:crypto";
import { syncAllAccounts } from "@/lib/ingestion/run";

// O Prisma aqui usa o adapter pg, que abre socket TCP: nao roda no edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Teto que vale em qualquer plano da Vercel. Com tres contas em paralelo e a
// janela padrao de 28 dias, uma execucao normal termina bem antes disso.
export const maxDuration = 60;

type Authorization = "ok" | "unauthorized" | "misconfigured";

function authorize(request: Request): Authorization {
  // Lido dentro da funcao, nao no topo do modulo: no topo o valor seria
  // congelado no `next build` em vez de valer o do ambiente de execucao.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return "misconfigured";
  }

  const received = request.headers.get("authorization");
  if (received === null) {
    return "unauthorized";
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(received);

  // timingSafeEqual exige buffers do mesmo tamanho. Comparar com `===` no lugar
  // dele sairia no primeiro byte diferente, e o tempo de resposta entregaria o
  // prefixo correto do segredo para quem estivesse tentando adivinhar.
  if (actual.length !== expected.length) {
    return "unauthorized";
  }

  return timingSafeEqual(actual, expected) ? "ok" : "unauthorized";
}

async function handle(request: Request): Promise<Response> {
  const authorization = authorize(request);

  // 500 e nao 401: sem o segredo configurado o defeito e do servidor, e
  // responder 401 esconderia isso atras de um erro de cliente. Em nenhum dos
  // dois casos a rota abre.
  if (authorization === "misconfigured") {
    return Response.json({ error: "CRON_SECRET nao esta configurado." }, { status: 500 });
  }

  if (authorization === "unauthorized") {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const report = await syncAllAccounts({ trigger: "cron" });

  // 200 mesmo com conta falhando: o resumo por conta ja diz qual quebrou, e um
  // 5xx faria a Vercel marcar a execucao inteira como falha quando so uma conta
  // ficou para tras.
  return Response.json(report);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}

// O Vercel Cron dispara a rota com GET. Sem este export o agendamento do
// vercel.json bateria em 405 todo dia as 9h e ninguem veria a ingestao parar.
export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

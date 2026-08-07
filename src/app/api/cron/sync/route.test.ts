import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Platform } from "@/generated/prisma/enums";
import type { SyncableAccount } from "@/lib/db/accounts";
import type { SyncResult, SyncSummary } from "@/lib/ingestion/sync";

const SECRET = "cron-secret-de-teste";
const ENDPOINT = "http://localhost/api/cron/sync";

type SyncStub = (adAccountId: string) => Promise<SyncResult>;

// Precisa ser hoisted: os factories de vi.mock rodam antes de qualquer
// inicializacao de modulo, entao a caixa que eles leem tem que existir antes.
const wiring = vi.hoisted(() => ({
  accounts: [] as unknown,
  sync: null as unknown,
}));

vi.mock("@/lib/db/accounts", () => ({
  listSyncableAccounts: async () => wiring.accounts,
}));

// Substitui so o syncAccount. O run.ts e o pool.ts continuam sendo os reais,
// senao "uma conta falha e as demais seguem" estaria testando o dublê em vez da
// orquestracao, que e justamente o que precisa valer aqui.
vi.mock("@/lib/ingestion/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/ingestion/sync")>()),
  syncAccount: (adAccountId: string) => (wiring.sync as SyncStub)(adAccountId),
}));

const { GET, POST } = await import("./route");

function account(id: string): SyncableAccount {
  return { id, name: `Conta ${id}`, platform: Platform.META, currency: "BRL" };
}

function summary(): SyncSummary {
  return {
    campaignsSynced: 2,
    insightsInserted: 56,
    insightsUpdated: 0,
    insightsSkipped: 0,
    since: "2026-07-09",
    until: "2026-08-05",
    durationMs: 12,
  };
}

function request(method: "GET" | "POST", authorization?: string): Request {
  return new Request(ENDPOINT, {
    method,
    headers: authorization === undefined ? {} : { authorization },
  });
}

let calls: string[];
let logged: string[];
const originalSecret = process.env.CRON_SECRET;

beforeEach(() => {
  calls = [];
  logged = [];
  wiring.accounts = [];
  wiring.sync = async (adAccountId: string): Promise<SyncResult> => {
    calls.push(adAccountId);
    return { ok: true, summary: summary() };
  };

  process.env.CRON_SECRET = SECRET;
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();

  if (originalSecret === undefined) {
    delete process.env.CRON_SECRET;
    return;
  }
  process.env.CRON_SECRET = originalSecret;
});

describe("POST /api/cron/sync", () => {
  it("recusa com 401 sem o header Authorization", async () => {
    wiring.accounts = [account("acc_1")];

    const response = await POST(request("POST"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "unauthorized" });
    expect(calls).toEqual([]);
  });

  it("recusa com 401 com o header errado e nao deixa o segredo vazar no log", async () => {
    wiring.accounts = [account("acc_1")];

    const response = await POST(request("POST", "Bearer segredo-errado"));

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
    expect(logged).toEqual([]);
    expect(logged.some((line) => line.includes(SECRET))).toBe(false);
  });

  // Prefixo certo e tamanho certo, so o ultimo byte diferente: pega comparacao
  // que so olha o inicio do header.
  it("recusa com 401 quando so o fim do segredo difere", async () => {
    const response = await POST(request("POST", `Bearer ${SECRET.slice(0, -1)}X`));

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("responde 200 com o resumo por conta quando o header confere", async () => {
    wiring.accounts = [account("acc_1"), account("acc_2")];

    const response = await POST(request("POST", `Bearer ${SECRET}`));
    const body = (await response.json()) as {
      total: number;
      succeeded: number;
      failed: number;
      accounts: { adAccountId: string; ok: boolean; summary?: SyncSummary }[];
    };

    expect(response.status).toBe(200);
    expect(calls).toEqual(["acc_1", "acc_2"]);
    expect(body.total).toBe(2);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(0);
    expect(body.accounts.map((entry) => entry.adAccountId)).toEqual(["acc_1", "acc_2"]);
    expect(body.accounts[0].summary?.insightsInserted).toBe(56);

    const lines = logged.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(lines.filter((line) => line.event === "sync.account")).toHaveLength(2);
    expect(lines.at(-1)).toMatchObject({ event: "sync.run", total: 2, succeeded: 2, failed: 0 });
  });

  // Os dois modos de falha: syncAccount devolvendo erro de dominio como valor, e
  // syncAccount escapando como excecao (getPrisma, timeout de transacao). Nenhum
  // dos dois pode impedir as outras contas de sincronizar.
  it("segue sincronizando as demais quando uma conta falha", async () => {
    wiring.accounts = [account("acc_1"), account("acc_2"), account("acc_3"), account("acc_4")];
    wiring.sync = async (adAccountId: string): Promise<SyncResult> => {
      calls.push(adAccountId);

      if (adAccountId === "acc_2") {
        return {
          ok: false,
          error: {
            code: "PROVIDER_UNAVAILABLE",
            message: "a plataforma devolveu 503.",
            adAccountId,
          },
        };
      }

      if (adAccountId === "acc_3") {
        throw new Error("Transaction already closed");
      }

      return { ok: true, summary: summary() };
    };

    const response = await POST(request("POST", `Bearer ${SECRET}`));
    const body = (await response.json()) as {
      total: number;
      succeeded: number;
      failed: number;
      accounts: { adAccountId: string; ok: boolean; error?: { code: string } }[];
    };

    expect(response.status).toBe(200);
    expect(calls).toEqual(["acc_1", "acc_2", "acc_3", "acc_4"]);
    expect(body.total).toBe(4);
    expect(body.succeeded).toBe(2);
    expect(body.failed).toBe(2);

    const byId = new Map(body.accounts.map((entry) => [entry.adAccountId, entry]));
    expect(byId.get("acc_1")?.ok).toBe(true);
    expect(byId.get("acc_4")?.ok).toBe(true);
    expect(byId.get("acc_2")?.error?.code).toBe("PROVIDER_UNAVAILABLE");
    expect(byId.get("acc_3")?.error?.code).toBe("UNEXPECTED");
  });

  it("nunca sincroniza mais de tres contas ao mesmo tempo", async () => {
    wiring.accounts = Array.from({ length: 9 }, (_, index) => account(`acc_${index}`));

    let inFlight = 0;
    let peak = 0;
    wiring.sync = async (adAccountId: string): Promise<SyncResult> => {
      calls.push(adAccountId);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return { ok: true, summary: summary() };
    };

    const response = await POST(request("POST", `Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(9);
    expect(peak).toBe(3);
  });

  // Sem CRON_SECRET a rota nao pode abrir. 500 e nao 401 porque o defeito e de
  // configuracao do servidor, e 401 esconderia isso como erro de cliente.
  it("responde 500 sem sincronizar quando CRON_SECRET nao esta configurado", async () => {
    delete process.env.CRON_SECRET;
    wiring.accounts = [account("acc_1")];

    const response = await POST(request("POST", `Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    expect(calls).toEqual([]);
  });
});

describe("GET /api/cron/sync", () => {
  // O Vercel Cron dispara com GET; se este export sumir, o agendamento das 9h
  // passa a bater em 405 e a ingestao para sem ninguem ver.
  it("aceita GET autorizado, que e como o cron da Vercel dispara", async () => {
    wiring.accounts = [account("acc_1")];

    const response = await GET(request("GET", `Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(calls).toEqual(["acc_1"]);
  });

  it("recusa GET sem header", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(401);
    expect(calls).toEqual([]);
  });
});

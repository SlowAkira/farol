import { describe, expect, it } from "vitest";
import { CampaignObjective, CampaignStatus } from "@/generated/prisma/enums";
import type { CampaignTableRow } from "@/lib/db/insights";
import { computeMetrics, type MetricTotals } from "@/lib/metrics/calc";
import {
  DEFAULT_SORT,
  resolveCampaignSort,
  sortCampaigns,
  toggleSort,
  type CampaignSort,
} from "./sort";

const ZERO: MetricTotals = {
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  conversionValueCents: 0,
  reach: 0,
};

function campanha(
  name: string,
  totals: Partial<MetricTotals>,
  overrides: Partial<Pick<CampaignTableRow, "hasData" | "objective" | "status">> = {},
): CampaignTableRow {
  const completos = { ...ZERO, ...totals };

  return {
    campaignId: name,
    externalId: name,
    name,
    objective: overrides.objective ?? CampaignObjective.CONVERSIONS,
    status: overrides.status ?? CampaignStatus.ACTIVE,
    hasData: overrides.hasData ?? true,
    totals: completos,
    metrics: computeMetrics(completos),
  };
}

function nomes(rows: readonly CampaignTableRow[]): string[] {
  return rows.map((row) => row.name);
}

describe("resolveCampaignSort", () => {
  it("aceita coluna e sentido validos", () => {
    expect(resolveCampaignSort("name", "asc")).toEqual({ column: "name", direction: "asc" });
    expect(resolveCampaignSort("roasRatio", "desc")).toEqual({
      column: "roasRatio",
      direction: "desc",
    });
  });

  // Mesma regra do periodo: a URL e editavel por qualquer um, entao entrada
  // invalida cai no padrao em vez de derrubar a pagina.
  it.each([
    ["coluna inexistente", "spend", "asc"],
    ["coluna que existe em MetricKey mas nao na tabela", "frequencyRatio", "asc"],
    ["nada", undefined, undefined],
  ])("cai no padrao com %s", (_caso, column, direction) => {
    expect(resolveCampaignSort(column, direction)).toEqual(DEFAULT_SORT);
  });

  it("trata sentido invalido como decrescente, sem recusar a coluna", () => {
    expect(resolveCampaignSort("name", "lateral")).toEqual({ column: "name", direction: "desc" });
  });
});

describe("toggleSort", () => {
  it("abre texto em crescente e numero em decrescente", () => {
    const atual: CampaignSort = { column: "spendCents", direction: "desc" };

    expect(toggleSort(atual, "name")).toEqual({ column: "name", direction: "asc" });
    expect(toggleSort(atual, "cpaCents")).toEqual({ column: "cpaCents", direction: "desc" });
  });

  it("inverte quando a coluna ja e a ativa", () => {
    expect(toggleSort({ column: "name", direction: "asc" }, "name")).toEqual({
      column: "name",
      direction: "desc",
    });
  });
});

describe("sortCampaigns", () => {
  it("ordena por metrica nos dois sentidos", () => {
    const rows = [
      campanha("media", { spendCents: 5_000 }),
      campanha("alta", { spendCents: 9_000 }),
      campanha("baixa", { spendCents: 1_000 }),
    ];

    expect(nomes(sortCampaigns(rows, { column: "spendCents", direction: "desc" }))).toEqual([
      "alta",
      "media",
      "baixa",
    ]);
    expect(nomes(sortCampaigns(rows, { column: "spendCents", direction: "asc" }))).toEqual([
      "baixa",
      "media",
      "alta",
    ]);
  });

  // O caso que motiva a regra: sem conversao o CPA e null, e tratar null como
  // zero faria "menor CPA" premiar justamente a campanha que nao converteu.
  it("manda travessao para o fim nos dois sentidos", () => {
    const rows = [
      campanha("sem conversao", { spendCents: 8_000, conversions: 0 }),
      campanha("cara", { spendCents: 8_000, conversions: 2 }),
      campanha("barata", { spendCents: 1_000, conversions: 10 }),
    ];

    expect(nomes(sortCampaigns(rows, { column: "cpaCents", direction: "asc" }))).toEqual([
      "barata",
      "cara",
      "sem conversao",
    ]);
    expect(nomes(sortCampaigns(rows, { column: "cpaCents", direction: "desc" }))).toEqual([
      "cara",
      "barata",
      "sem conversao",
    ]);
  });

  it("trata campanha sem ingestao como ausencia, e nao como zero", () => {
    const rows = [
      campanha("sem ingestao", {}, { hasData: false }),
      campanha("gastou zero", { spendCents: 0, impressions: 500 }),
      campanha("gastou", { spendCents: 3_000 }),
    ];

    expect(nomes(sortCampaigns(rows, { column: "spendCents", direction: "asc" }))).toEqual([
      "gastou zero",
      "gastou",
      "sem ingestao",
    ]);
  });

  it("ordena texto pelo rotulo em portugues, nao pelo enum do banco", () => {
    const rows = [
      campanha("a", {}, { status: CampaignStatus.PAUSED }),
      campanha("b", {}, { status: CampaignStatus.DELETED }),
      campanha("c", {}, { status: CampaignStatus.ACTIVE }),
    ];

    // Ativa, Excluida, Pausada. Pelo enum seria ACTIVE, DELETED, PAUSED, que
    // coincide aqui; o que o teste fixa e que a ordem segue o que esta na tela.
    expect(nomes(sortCampaigns(rows, { column: "status", direction: "asc" }))).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("desempata pelo nome para a ordem nao depender do banco", () => {
    const rows = [
      campanha("zulu", { spendCents: 1_000 }),
      campanha("alfa", { spendCents: 1_000 }),
      campanha("mike", { spendCents: 1_000 }),
    ];

    expect(nomes(sortCampaigns(rows, { column: "spendCents", direction: "desc" }))).toEqual([
      "alfa",
      "mike",
      "zulu",
    ]);
  });

  it("nao muta o array recebido", () => {
    const rows = [campanha("b", { spendCents: 1 }), campanha("a", { spendCents: 2 })];
    const antes = nomes(rows);

    sortCampaigns(rows, { column: "spendCents", direction: "desc" });

    expect(nomes(rows)).toEqual(antes);
  });
});

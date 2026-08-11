import type { CampaignTableRow } from "@/lib/db/insights";
import { metricValues } from "@/lib/metrics/calc";
import { CAMPAIGN_TABLE_METRICS, type CampaignTableMetricKey } from "@/lib/metrics/catalog";
import { OBJECTIVE_LABEL, STATUS_LABEL } from "./labels";

export type TextColumn = "name" | "objective" | "status";
export type SortColumn = TextColumn | CampaignTableMetricKey;
export type SortDirection = "asc" | "desc";

export type CampaignSort = {
  readonly column: SortColumn;
  readonly direction: SortDirection;
};

// Maior gasto primeiro: e a pergunta que se faz primeiro sobre uma lista de
// campanhas, e a mesma ordem do bloco de destaque no dashboard.
export const DEFAULT_SORT: CampaignSort = { column: "spendCents", direction: "desc" };

const TEXT_COLUMNS: readonly TextColumn[] = ["name", "objective", "status"];
const METRIC_COLUMNS = CAMPAIGN_TABLE_METRICS.map((definition) => definition.key);

function isSortColumn(value: string): value is SortColumn {
  return (
    TEXT_COLUMNS.includes(value as TextColumn) ||
    METRIC_COLUMNS.includes(value as CampaignTableMetricKey)
  );
}

// Coluna e sentido vem da URL, editaveis por qualquer um: valor que nao existe
// cai no padrao em vez de derrubar a pagina, mesma regra do periodo.
export function resolveCampaignSort(column?: string, direction?: string): CampaignSort {
  if (column === undefined || !isSortColumn(column)) {
    return DEFAULT_SORT;
  }

  return { column, direction: direction === "asc" ? "asc" : "desc" };
}

// Primeiro clique numa coluna nova abre no sentido mais util dela: texto comeca
// em A-Z e numero comeca do maior. Clicar de novo na mesma coluna inverte.
export function toggleSort(current: CampaignSort, column: SortColumn): CampaignSort {
  if (current.column !== column) {
    return { column, direction: TEXT_COLUMNS.includes(column as TextColumn) ? "asc" : "desc" };
  }

  return { column, direction: current.direction === "asc" ? "desc" : "asc" };
}

function textOf(row: CampaignTableRow, column: TextColumn): string {
  switch (column) {
    case "name":
      return row.name;
    case "objective":
      return OBJECTIVE_LABEL[row.objective];
    case "status":
      return STATUS_LABEL[row.status];
  }
}

// Ordena pelo rotulo que aparece na tela, e nao pelo enum do banco: a lista
// ordenada por "Status" tem que sair na ordem que a pessoa le, e ACTIVE/PAUSED
// ordena em ingles.
const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

// A chave de cada linha sai uma vez, antes de ordenar, e nao dentro do
// comparador: o comparador roda O(n log n) vezes e recalcular as derivadas de
// uma campanha ali dentro seria refazer a mesma divisao dezenas de vezes por
// linha. Campanha sem ingestao no periodo tem chave null, e nao zero -- ausencia
// nao e um valor pequeno.
function sortKey(row: CampaignTableRow, column: CampaignTableMetricKey): number | null {
  if (!row.hasData) {
    return null;
  }
  return metricValues(row.totals)[column];
}

export function sortCampaigns(
  rows: readonly CampaignTableRow[],
  sort: CampaignSort,
): CampaignTableRow[] {
  const fator = sort.direction === "asc" ? 1 : -1;
  const textual = TEXT_COLUMNS.includes(sort.column as TextColumn);

  const comChave = rows.map((row) => ({
    row,
    texto: textual ? textOf(row, sort.column as TextColumn) : "",
    numero: textual ? null : sortKey(row, sort.column as CampaignTableMetricKey),
  }));

  // Empate desfeito pelo nome para a ordem nao depender de como o banco devolveu
  // as linhas: sem isso duas campanhas de mesmo gasto trocam de lugar entre um
  // carregamento e outro.
  const porNome = (a: CampaignTableRow, b: CampaignTableRow): number =>
    collator.compare(a.name, b.name);

  comChave.sort((a, b) => {
    if (textual) {
      const comparacao = collator.compare(a.texto, b.texto);
      return comparacao === 0 ? porNome(a.row, b.row) : comparacao * fator;
    }

    // Travessao vai para o fim nos dois sentidos. Tratar null como zero faria
    // "menor CPA" premiar justamente a campanha que nao teve conversao nenhuma.
    if (a.numero === null || b.numero === null) {
      if (a.numero === b.numero) {
        return porNome(a.row, b.row);
      }
      return a.numero === null ? 1 : -1;
    }

    return a.numero === b.numero ? porNome(a.row, b.row) : (a.numero - b.numero) * fator;
  });

  return comChave.map((entrada) => entrada.row);
}

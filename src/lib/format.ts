import type { MetricUnit } from "@/lib/metrics/catalog";

const LOCALE = "pt-BR";
const CENTS_PER_UNIT = 100;

// Marcador unico para "nao ha numero": derivada sem denominador (ROAS de gasto
// zero) e periodo anterior inexistente chegam aqui como null, e a celula precisa
// ficar visivelmente vazia em vez de mostrar 0, que seria uma afirmacao falsa.
const EMPTY_DISPLAY = "—";
const EMPTY_TITLE = "Sem dados no período";

// Intl.NumberFormat e caro de construir e o painel formata centenas de celulas
// por render; o cache segue o mesmo padrao de src/lib/dates.ts.
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const cached = formatters.get(key);
  if (cached) {
    return cached;
  }

  const created = new Intl.NumberFormat(LOCALE, options);
  formatters.set(key, created);
  return created;
}

// A divisao por 100 acontece aqui, uma vez, e nao em cada componente: centavos
// sao a unidade que circula no sistema inteiro (CLAUDE.md) e este e o unico
// ponto onde eles viram a unidade que uma pessoa le.
function toCurrencyUnits(cents: number): number {
  return cents / CENTS_PER_UNIT;
}

export function formatCurrency(cents: number, currency: string): string {
  return formatter(`currency:${currency}`, { style: "currency", currency }).format(
    toCurrencyUnits(cents),
  );
}

// Compacto encurta o eixo e o cartao ("R$ 12,3 mil"); o valor exato continua
// alcancavel pelo title, entao a abreviacao nunca esconde o numero.
// minimumFractionDigits explicito, e nao herdado: em moeda o padrao vem da
// propria moeda (BRL pede 2 casas) e o ICU do Node 20 aplica isso ao compacto,
// devolvendo "R$ 842,0" onde o Node 24 devolve "R$ 842". Sem fixar o minimo o
// formato do painel muda conforme a versao do runtime.
export function formatCurrencyCompact(cents: number, currency: string): string {
  return formatter(`currencyCompact:${currency}`, {
    style: "currency",
    currency,
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(toCurrencyUnits(cents));
}

export function formatCount(value: number): string {
  return formatter("count", { maximumFractionDigits: 0 }).format(value);
}

export function formatCountCompact(value: number): string {
  return formatter("countCompact", {
    notation: "compact",
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatRatio(value: number, fractionDigits = 2): string {
  return `${formatter(`ratio:${fractionDigits}`, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)}×`;
}

export function formatPercent(value: number, fractionDigits = 2): string {
  return `${formatter(`percent:${fractionDigits}`, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)}%`;
}

// Sempre com sinal explicito, inclusive o "+": a seta ao lado carrega a direcao
// para quem nao distingue verde de vermelho, e o sinal carrega para quem le so o
// texto (por exemplo em leitor de tela).
export function formatDeltaPercent(value: number): string {
  return `${formatter("delta", {
    signDisplay: "exceptZero",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

export function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

export type FormattedMetric = {
  // O que aparece na tela: abreviado quando a grandeza cresce muito.
  readonly display: string;
  // O que vai no atributo title: sempre o numero inteiro, sem abreviacao.
  readonly title: string;
};

export function formatMetric(
  value: number | null,
  unit: MetricUnit,
  currency: string,
): FormattedMetric {
  if (value === null) {
    return { display: EMPTY_DISPLAY, title: EMPTY_TITLE };
  }

  switch (unit) {
    case "currency":
      return { display: formatCurrencyCompact(value, currency), title: formatCurrency(value, currency) };
    case "count":
      return { display: formatCountCompact(value), title: formatCount(value) };
    case "ratio":
      // Razao e percentual ficam em uma casa na tela e quatro no title: nao sao
      // grandes o bastante para pedir abreviacao, mas o arredondamento ainda
      // esconde diferenca que a comparacao entre periodos torna visivel.
      return { display: formatRatio(value, 1), title: formatRatio(value, 4) };
    case "percent":
      return { display: formatPercent(value, 1), title: formatPercent(value, 4) };
  }
}

export function formatDelta(deltaPercent: number | null): FormattedMetric {
  if (deltaPercent === null) {
    return { display: EMPTY_DISPLAY, title: "Sem período anterior comparável" };
  }

  return {
    display: formatDeltaPercent(deltaPercent),
    title: `${formatDeltaPercent(deltaPercent)} vs. período anterior`,
  };
}

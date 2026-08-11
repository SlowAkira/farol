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

// Rotulo de eixo e de coluna: curto e de largura constante, porque ali dezenas
// deles ficam lado a lado. Data em prosa usa formatDay/formatPeriod abaixo.
export function formatDayLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

// Meses escritos a mao em vez de Intl com `month: "short"`. O ICU devolve "jul."
// numas versoes de Node e "jul" em outras -- a mesma deriva de runtime que ja
// obrigou a fixar minimumFractionDigits no compacto acima. Data que ganha ponto
// final conforme a maquina nao e formato, e sorte.
const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

type PartesDeData = { readonly ano: string; readonly mes: string; readonly dia: number };

// Le a string YYYY-MM-DD por pedaco, sem passar por Date: data de metrica e o
// dia no fuso da conta de anuncios (CLAUDE.md), e construir um Date so para
// formatar reintroduz o fuso da maquina que o formato existe para evitar.
function partesDeData(isoDate: string): PartesDeData | null {
  const [ano, mes, dia] = isoDate.split("-");
  const indiceDoMes = Number.parseInt(mes ?? "", 10) - 1;
  const numeroDoDia = Number.parseInt(dia ?? "", 10);
  const nomeDoMes = MESES_CURTOS[indiceDoMes];

  if (ano === undefined || nomeDoMes === undefined || Number.isNaN(numeroDoDia)) {
    return null;
  }

  return { ano, mes: nomeDoMes, dia: numeroDoDia };
}

// Entrada que nao e data volta como veio, em vez de virar excecao ou "NaN de
// undefined": o ISO cru e feio, mas continua sendo verdade, e um rotulo de
// periodo nao pode derrubar a pagina.
export function formatDay(isoDate: string): string {
  const partes = partesDeData(isoDate);
  return partes === null ? isoDate : `${partes.dia} ${partes.mes}`;
}

// O ano so aparece quando o periodo cruza a virada: dentro do mesmo ano ele e
// ruido, e entre dezembro e janeiro e a unica coisa que desfaz a ambiguidade.
export function formatPeriod(since: string, until: string): string {
  const inicio = partesDeData(since);
  const fim = partesDeData(until);

  if (inicio === null || fim === null) {
    return `${since} a ${until}`;
  }
  if (since === until) {
    return `${inicio.dia} ${inicio.mes}`;
  }
  if (inicio.ano !== fim.ano) {
    return `${inicio.dia} ${inicio.mes} ${inicio.ano} a ${fim.dia} ${fim.mes} ${fim.ano}`;
  }

  return `${inicio.dia} ${inicio.mes} a ${fim.dia} ${fim.mes}`;
}

export type FormattedMetric = {
  // O que aparece na tela: abreviado quando a grandeza cresce muito.
  readonly display: string;
  // O que vai no atributo title: sempre o numero inteiro, sem abreviacao.
  readonly title: string;
};

// `motivo` vem de src/lib/metrics/availability: e a grandeza que faltou para a
// metrica existir ("Sem conversão registrada no período"). Opcional porque nem
// todo chamador tem os totais em maos -- eixo de grafico formata numero solto --
// e nesses casos o travessao cai na frase generica, que e vaga mas nao falsa.
export function formatMetric(
  value: number | null,
  unit: MetricUnit,
  currency: string,
  motivo?: string | null,
): FormattedMetric {
  if (value === null) {
    return { display: EMPTY_DISPLAY, title: motivo ?? EMPTY_TITLE };
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

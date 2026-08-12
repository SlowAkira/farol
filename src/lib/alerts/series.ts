import type { AlertMetric } from "@/generated/prisma/enums";
import { metricValues, sumTotals, type MetricTotals } from "@/lib/metrics/calc";
import { alertMetricSpec } from "./metrics";

// Serie diaria de um alvo (a conta inteira ou uma campanha). Mesma forma que
// DailyTotals de src/lib/db/insights, declarada aqui para o backtest e o mini
// grafico nao dependerem da camada de banco so por um tipo.
export type DayTotals = MetricTotals & {
  readonly date: string;
  // Zero e ausencia sao coisas diferentes: dia sem insight nenhum e dia que
  // rodou e gastou zero chegam com os mesmos totais. O grafico precisa da
  // distincao para nao desenhar uma queda que ninguem mediu, e a janela do
  // backtest precisa para saber se a campanha sequer existia ali.
  readonly hasData: boolean;
};

// As series chegam ordenadas por data e sem buraco (o zero-fill acontece na
// consulta), entao recortar por intervalo e comparar string: YYYY-MM-DD ordena
// lexicograficamente na ordem do calendario.
export function sliceByDate(
  days: readonly DayTotals[],
  since: string,
  until: string,
): readonly DayTotals[] {
  return days.filter((day) => day.date >= since && day.date <= until);
}

export function totalsBetween(
  days: readonly DayTotals[],
  since: string,
  until: string,
): MetricTotals {
  return sumTotals(sliceByDate(days, since, until));
}

// Se a campanha entregou alguma coisa na janela. O motor monta os alvos a partir
// do breakdown do periodo, e campanha sem linha nenhuma simplesmente nao aparece
// la -- nao vira um alvo com totais zerados. O backtest precisa da mesma
// pergunta para nao transformar "parou de rodar" em "despencou".
export function hasDataBetween(
  days: readonly DayTotals[],
  since: string,
  until: string,
): boolean {
  return sliceByDate(days, since, until).some((day) => day.hasData);
}

// Soma varias series diarias numa so, alinhando por data. E como a conta inteira
// se forma a partir das campanhas quando a consulta ja trouxe o detalhe por
// campanha: uma segunda ida ao banco para pedir o mesmo dado agregado custaria
// mais que o loop.
export function mergeSeries(series: readonly (readonly DayTotals[])[]): readonly DayTotals[] {
  const porData = new Map<string, DayTotals[]>();
  for (const dias of series) {
    for (const dia of dias) {
      const lista = porData.get(dia.date);
      if (lista === undefined) {
        porData.set(dia.date, [dia]);
        continue;
      }
      lista.push(dia);
    }
  }

  return [...porData.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, dias]) => ({
      date,
      // Um dia medido em qualquer campanha e um dia medido na conta: exigir
      // todas apagaria da serie o dia em que uma campanha estava pausada.
      hasData: dias.some((dia) => dia.hasData),
      ...sumTotals(dias),
    }));
}

// A metrica do alerta, dia a dia, pronta para a sparkline. Dia sem ingestao vira
// null em vez de zero: a sparkline interrompe o traco ali, e nao desenha uma
// queda a pique que so significa "ainda nao sabemos".
export function metricByDay(
  days: readonly DayTotals[],
  metric: AlertMetric,
): readonly (number | null)[] {
  const { key } = alertMetricSpec(metric);
  return days.map((day) => (day.hasData ? metricValues(day)[key] : null));
}

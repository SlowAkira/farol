import { AlertScope } from "@/generated/prisma/enums";
import { getPreviousPeriod, type Period } from "@/lib/db/insights";
import { addDays, daysBetween } from "@/lib/dates";
import {
  hasDataBetween,
  totalsBetween,
  type DayTotals,
} from "./series";
import { evaluateRule, type AlertContext, type AlertTarget, type EvaluableRule } from "./rules";

// Quantas vezes esta regra teria disparado no historico que ja esta no banco.
// A pergunta que o formulario faz antes de gravar a regra, e a unica defesa
// barata contra a regra barulhenta -- limiar apertado demais nao se descobre
// lendo o formulario, se descobre no dia seguinte com trinta notificacoes.
//
// Nada aqui reimplementa a condicao: o dia simulado monta as mesmas duas janelas
// que o motor monta e chama o mesmo evaluateRule. Um backtest com regra propria
// de disparo mediria uma regra que nao e a que vai rodar.

export type BacktestSeries = {
  // null e a conta inteira, igual ao alvo do motor em escopo ACCOUNT.
  readonly target: AlertTarget | null;
  readonly days: readonly DayTotals[];
};

export type BacktestFiring = {
  // Dia em que a condicao passou a valer -- nao todo dia em que ela valia.
  readonly date: string;
  // Dia em que a condicao deixou de valer, ou null se ela ainda valia no fim do
  // periodo simulado. E o mesmo par abre/fecha que o motor grava em
  // triggeredAt/resolvedAt, e e o que permite reconstituir um episodio inteiro a
  // partir do backtest.
  readonly resolvedOn: string | null;
  readonly target: AlertTarget | null;
  readonly context: AlertContext;
};

export type BacktestResult = {
  // Do mais recente para o mais antigo: e a ordem em que a lista e lida.
  readonly firings: readonly BacktestFiring[];
  // Dias do periodo em que deu para medir a regra em pelo menos um alvo. Um
  // backtest com zero disparos e outra coisa quando nenhum dia foi mensuravel:
  // no primeiro caso a regra e quieta, no segundo ela e cega.
  readonly evaluatedDays: number;
  readonly totalDays: number;
};

export type BacktestInput = {
  readonly rule: EvaluableRule;
  readonly series: readonly BacktestSeries[];
  // Primeiro e ultimo dia simulados. As series precisam alcancar
  // `2 * windowDays` dias antes de `since`, senao os primeiros dias comparam
  // contra uma janela anterior truncada e o percentual sai inflado.
  readonly since: string;
  readonly until: string;
};

function diasDoPeriodo(since: string, until: string): readonly string[] {
  const total = daysBetween(since, until);
  if (total < 0) {
    return [];
  }
  return Array.from({ length: total + 1 }, (_, offset) => addDays(since, offset));
}

function janelaEm(asOf: string, windowDays: number): Period {
  return { since: addDays(asOf, -(windowDays - 1)), until: asOf };
}

// O `resolvedOn` so se conhece dias depois do disparo, entao o registro nasce
// mutavel aqui dentro e sai congelado no resultado.
type Episodio = {
  readonly date: string;
  resolvedOn: string | null;
  readonly target: AlertTarget | null;
  readonly context: AlertContext;
};

export function backtestRule({ rule, series, since, until }: BacktestInput): BacktestResult {
  const dias = diasDoPeriodo(since, until);
  const firings: Episodio[] = [];
  const diasMedidos = new Set<string>();

  for (const { target, days } of series) {
    // O motor nao abre alerta novo enquanto existe um aberto com o mesmo
    // fingerprint. Simular isso e o que separa "a regra apontou um problema" de
    // "a regra reclamou todo dia do mesmo problema" -- sem esta trava um limiar
    // ruim mostraria 60 disparos onde houve um episodio de 60 dias, e um limiar
    // bom mostraria 3 onde houve 3. Sao numeros incomparaveis.
    let aberto: Episodio | null = null;

    for (const date of dias) {
      const current = janelaEm(date, rule.windowDays);
      const previous = getPreviousPeriod(current.since, current.until);

      // Campanha sem entrega nenhuma na janela nao aparece no breakdown daquele
      // dia, entao o motor nao a avalia -- e nao avaliar tambem nao fecha o que
      // ja estava aberto.
      if (rule.scope === AlertScope.CAMPAIGN && !hasDataBetween(days, current.since, current.until)) {
        continue;
      }

      const outcome = evaluateRule({
        rule,
        target,
        current: { period: current, totals: totalsBetween(days, current.since, current.until) },
        previous: { period: previous, totals: totalsBetween(days, previous.since, previous.until) },
      });

      // Inavaliavel nao dispara e nao resolve: e "nao deu para saber", nao "a
      // condicao deixou de valer". Mesma regra do motor.
      if (outcome.kind === "unevaluable") {
        continue;
      }

      diasMedidos.add(date);

      if (outcome.kind === "fired") {
        if (aberto === null) {
          aberto = { date, resolvedOn: null, target, context: outcome.context };
          firings.push(aberto);
        }
        continue;
      }

      // A condicao deixou de valer: e este o dia em que o motor teria fechado o
      // alerta, e nao o dia seguinte nem o fim do periodo.
      if (aberto !== null) {
        aberto.resolvedOn = date;
        aberto = null;
      }
    }
  }

  return {
    firings: firings.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    evaluatedDays: diasMedidos.size,
    totalDays: dias.length,
  };
}

import { describe, expect, it } from "vitest";
import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import { addDays } from "@/lib/dates";
import { backtestRule, type BacktestSeries } from "./backtest";
import type { DayTotals } from "./series";
import type { EvaluableRule } from "./rules";

const PRIMEIRO_DIA = "2026-01-01";

// Volume folgado acima do piso de 30 conversoes, para nenhum dia cair em
// "volume insuficiente" por acidente e apagar um disparo que o teste espera.
const CONVERSOES_POR_DIA = 10;

type PerfilDoDia = {
  readonly cpaCents: number;
  readonly semDado?: boolean;
};

// Um dia sintetico com o CPA pedido: gasto = CPA x conversoes.
function dia(date: string, perfil: PerfilDoDia): DayTotals {
  if (perfil.semDado) {
    return {
      date,
      hasData: false,
      impressions: 0,
      clicks: 0,
      spendCents: 0,
      conversions: 0,
      conversionValueCents: 0,
      reach: 0,
    };
  }

  return {
    date,
    hasData: true,
    impressions: 10_000,
    clicks: 200,
    spendCents: perfil.cpaCents * CONVERSOES_POR_DIA,
    conversions: CONVERSOES_POR_DIA,
    conversionValueCents: 500_000,
    reach: 8_000,
  };
}

// Serie a partir de uma funcao do indice do dia, para o teste descrever o
// comportamento ("o CPA dobra no dia 40") em vez de listar 60 linhas.
function serie(total: number, perfilDoDia: (indice: number) => PerfilDoDia): readonly DayTotals[] {
  return Array.from({ length: total }, (_, indice) =>
    dia(addDays(PRIMEIRO_DIA, indice), perfilDoDia(indice)),
  );
}

function conta(days: readonly DayTotals[]): BacktestSeries {
  return { target: null, days };
}

function campanha(campaignId: string, campaignName: string, days: readonly DayTotals[]): BacktestSeries {
  return { target: { campaignId, campaignName }, days };
}

function regra(overrides: Partial<EvaluableRule> = {}): EvaluableRule {
  return {
    id: "regra_1",
    metric: AlertMetric.CPA,
    comparison: AlertComparison.ABSOLUTE_THRESHOLD,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.ACCOUNT,
    threshold: 4_500,
    windowDays: 7,
    ...overrides,
  };
}

// Os 14 primeiros dias sao o lastro das duas janelas de 7; a simulacao comeca no
// dia 14 para nenhum disparo sair de janela truncada.
const TOTAL_DE_DIAS = 60;
const SIMULA_DE = addDays(PRIMEIRO_DIA, 14);
const SIMULA_ATE = addDays(PRIMEIRO_DIA, TOTAL_DE_DIAS - 1);

function rodar(rule: EvaluableRule, series: readonly BacktestSeries[]) {
  return backtestRule({ rule, series, since: SIMULA_DE, until: SIMULA_ATE });
}

describe("backtestRule", () => {
  it("nao dispara quando a metrica nunca cruza o limiar", () => {
    const resultado = rodar(regra(), [conta(serie(TOTAL_DE_DIAS, () => ({ cpaCents: 2_000 })))]);

    expect(resultado.firings).toEqual([]);
    // Nenhum disparo com todos os dias mensuraveis e uma regra quieta, e nao uma
    // regra cega -- a distincao e o que o preview precisa mostrar.
    expect(resultado.evaluatedDays).toBe(resultado.totalDays);
  });

  // O ponto do backtest: um episodio unico e um disparo, e nao um por dia em que
  // o problema continuou. Sem isto o numero na tela mediria a duracao do
  // problema, nao a barulheira da regra.
  it("conta um disparo por episodio, e nao um por dia", () => {
    const degradaNoDia = 25;
    const resultado = rodar(regra(), [
      conta(serie(TOTAL_DE_DIAS, (indice) => ({ cpaCents: indice >= degradaNoDia ? 9_000 : 2_000 }))),
    ]);

    expect(resultado.firings).toHaveLength(1);
  });

  it("marca o dia em que o episodio fechou, e deixa aberto o que nunca fechou", () => {
    const voltaAoNormalNoDia = 40;
    const { firings } = rodar(regra(), [
      conta(
        serie(TOTAL_DE_DIAS, (indice) => ({
          cpaCents: indice >= 20 && indice < voltaAoNormalNoDia ? 9_000 : 2_000,
        })),
      ),
    ]);

    expect(firings).toHaveLength(1);
    // A janela e uma media de 7 dias, entao ela nao cai no dia em que o CPA cai:
    // com 9.000 e 2.000 misturados, a media so volta abaixo de 4.500 quando
    // sobram menos de tres dias degradados na janela -- o quarto dia depois da
    // volta ao normal. E esse o dia em que o motor fecharia o alerta.
    expect(firings[0].resolvedOn).toBe(addDays(PRIMEIRO_DIA, voltaAoNormalNoDia + 4));
  });

  it("deixa resolvedOn nulo quando a condicao ainda valia no fim do periodo", () => {
    const { firings } = rodar(regra(), [
      conta(serie(TOTAL_DE_DIAS, (indice) => ({ cpaCents: indice >= 25 ? 9_000 : 2_000 }))),
    ]);

    expect(firings[0].resolvedOn).toBeNull();
  });

  it("volta a disparar depois que a condicao deixa de valer", () => {
    // Dois picos separados por um vale longo o bastante para a janela de 7 dias
    // voltar inteira ao normal entre eles.
    const noPico = (indice: number) => (indice >= 20 && indice < 28) || indice >= 45;
    const resultado = rodar(regra(), [
      conta(serie(TOTAL_DE_DIAS, (indice) => ({ cpaCents: noPico(indice) ? 9_000 : 2_000 }))),
    ]);

    expect(resultado.firings).toHaveLength(2);
  });

  it("devolve os disparos do mais recente para o mais antigo", () => {
    const noPico = (indice: number) => (indice >= 20 && indice < 28) || indice >= 45;
    const { firings } = rodar(regra(), [
      conta(serie(TOTAL_DE_DIAS, (indice) => ({ cpaCents: noPico(indice) ? 9_000 : 2_000 }))),
    ]);

    expect(firings[0].date > firings[1].date).toBe(true);
  });

  it("dispara por variacao percentual comparando com a janela anterior", () => {
    const resultado = rodar(
      regra({ comparison: AlertComparison.PCT_CHANGE, threshold: 50 * 100 }),
      [conta(serie(TOTAL_DE_DIAS, (indice) => ({ cpaCents: indice >= 30 ? 6_000 : 2_000 })))],
    );

    expect(resultado.firings).toHaveLength(1);
    // O contexto do disparo sai do mesmo evaluateRule do motor, entao ja traz os
    // dois valores que o preview e o cartao usam para explicar o alerta.
    expect(resultado.firings[0].context.current.value).toBeGreaterThan(
      resultado.firings[0].context.previous.value ?? 0,
    );
  });

  it("separa os disparos por campanha no escopo de campanha", () => {
    const rule = regra({ scope: AlertScope.CAMPAIGN });
    const cara = serie(TOTAL_DE_DIAS, (indice) => ({ cpaCents: indice >= 30 ? 9_000 : 2_000 }));
    const barata = serie(TOTAL_DE_DIAS, () => ({ cpaCents: 1_000 }));

    const { firings } = rodar(rule, [
      campanha("camp_1", "Captação de Leads", cara),
      campanha("camp_2", "Remarketing 30d", barata),
    ]);

    expect(firings).toHaveLength(1);
    expect(firings[0].target?.campaignName).toBe("Captação de Leads");
  });

  // Campanha sem entrega nenhuma na janela nao entra no breakdown daquele dia, e
  // o motor nao a avalia. Trata-la como janela zerada transformaria "parou de
  // rodar" em "o CPA despencou".
  it("ignora o dia em que a campanha nao teve entrega nenhuma na janela", () => {
    const rule = regra({ scope: AlertScope.CAMPAIGN, threshold: 4_500 });
    const parada = serie(TOTAL_DE_DIAS, (indice) =>
      indice >= 20 ? { cpaCents: 0, semDado: true } : { cpaCents: 9_000 },
    );

    const { firings } = rodar(rule, [campanha("camp_1", "Pausada", parada)]);

    // Dispara enquanto rodava e nunca mais: os dias sem entrega nao geram
    // disparo novo nem resolvem o que ja estava aberto.
    expect(firings).toHaveLength(1);
    expect(firings[0].date < addDays(PRIMEIRO_DIA, 27)).toBe(true);
  });

  // Volume abaixo do piso e "nao deu para medir", nao "a condicao deixou de
  // valer": nao resolve o episodio aberto, entao a volta do problema depois de
  // um vale sem volume nao conta como disparo novo.
  it("nao reabre o episodio depois de dias inavaliaveis", () => {
    const poucoVolume: DayTotals = {
      date: "",
      hasData: true,
      impressions: 10,
      clicks: 1,
      spendCents: 90_000,
      conversions: 1,
      conversionValueCents: 0,
      reach: 8,
    };

    const days = serie(TOTAL_DE_DIAS, () => ({ cpaCents: 9_000 })).map((day, indice) =>
      indice >= 25 && indice < 35 ? { ...poucoVolume, date: day.date } : day,
    );

    const { firings } = rodar(regra(), [conta(days)]);

    expect(firings).toHaveLength(1);
  });

  it("conta como nao medido o periodo inteiro sem volume", () => {
    const days = serie(TOTAL_DE_DIAS, () => ({ cpaCents: 0, semDado: true }));
    const resultado = rodar(regra(), [conta(days)]);

    expect(resultado.firings).toEqual([]);
    expect(resultado.evaluatedDays).toBe(0);
    expect(resultado.totalDays).toBe(TOTAL_DE_DIAS - 14);
  });

  it("devolve periodo vazio quando o fim vem antes do inicio", () => {
    const resultado = backtestRule({
      rule: regra(),
      series: [conta(serie(TOTAL_DE_DIAS, () => ({ cpaCents: 9_000 })))],
      since: SIMULA_ATE,
      until: SIMULA_DE,
    });

    expect(resultado).toEqual({ firings: [], evaluatedDays: 0, totalDays: 0 });
  });
});

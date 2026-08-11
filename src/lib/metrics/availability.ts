import type { MetricKey, MetricTotals } from "./calc";

// Toda metrica derivada vira null pela ausencia de uma grandeza especifica, e
// qual e essa grandeza e a unica coisa que a interface tem a dizer sobre o
// travessao. "Sem dados no periodo" serve para tudo e por isso nao explica nada:
// o CPA de uma campanha que teve 40 mil impressoes nao esta sem dado, esta sem
// conversao. A frase vive aqui, junto do calculo que produz o null, e nao no
// componente, para as duas nao poderem divergir.
const SEM_IMPRESSAO = "Sem impressão registrada no período";
const SEM_CLIQUE = "Sem clique registrado no período";
const SEM_CONVERSAO = "Sem conversão registrada no período";
const SEM_VALOR_DE_CONVERSAO = "Sem valor de conversão registrado no período";
const SEM_GASTO = "Sem gasto registrado no período";
const SEM_ALCANCE = "Sem alcance registrado no período";

// A unica que nao sai dos totais: linha nenhuma ingerida e linha ingerida com
// tudo zero chegam com os mesmos totais, e so quem consultou o banco sabe qual
// das duas e. Mora aqui junto das outras porque e o mesmo vocabulario -- a
// resposta a "por que ha um travessao aqui" nao deve estar espalhada.
export const SEM_INGESTAO = "Sem métrica ingerida neste período";

// Null quando a metrica se aplica: o motivo so existe onde ha travessao. Os
// totais nunca caem aqui -- vieram de uma soma, e periodo sem linha nenhuma soma
// zero de verdade, que e um numero medido e nao uma lacuna.
//
// O par com computeMetrics e invariante, nao coincidencia: metrica null tem
// exatamente um motivo, e metrica com valor nao tem nenhum. availability.test.ts
// varre as combinacoes de zero e cobra as duas direcoes, entao mexer num
// denominador em calc.ts sem mexer aqui quebra o teste em vez de vazar um
// travessao sem explicacao para a tela.
export function metricUnavailability(key: MetricKey, totals: MetricTotals): string | null {
  switch (key) {
    case "ctrPercent":
    case "cpmCents":
      return totals.impressions === 0 ? SEM_IMPRESSAO : null;
    case "cpcCents":
      return totals.clicks === 0 ? SEM_CLIQUE : null;
    case "cpaCents":
      return totals.conversions === 0 ? SEM_CONVERSAO : null;
    case "frequencyRatio":
      return totals.reach === 0 ? SEM_ALCANCE : null;
    // Duas causas, e a ordem importa: sem gasto nenhum a conta nem rodou no
    // periodo, o que explica mais do que a falta de receita que vem junto.
    case "roasRatio":
      if (totals.spendCents === 0) {
        return SEM_GASTO;
      }
      return totals.conversionValueCents === 0 ? SEM_VALOR_DE_CONVERSAO : null;
    default:
      return null;
  }
}

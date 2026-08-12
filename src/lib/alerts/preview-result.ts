// O resultado do preview de backtest e o julgamento dele. Separado de
// ./preview.ts, que faz as consultas, por um motivo concreto: o formulario de
// regra e client, e importar o modulo que le o banco arrastaria o Prisma e o
// `pg` para o bundle do navegador -- que nem compila, porque `pg` pede `fs`.
// Aqui nao ha import nenhum, entao os dois lados leem a mesma verdade.

// Quanto historico o preview simula. Noventa dias e o intervalo em que uma conta
// de trafego ja passou por fim de mes, promocao e troca de criativo -- suficiente
// para uma regra barulhenta se revelar, e curto o bastante para caber numa
// consulta sincrona enquanto a pessoa digita o limiar.
export const BACKTEST_DAYS = 90;

export type BacktestFiringView = {
  readonly date: string;
  readonly campaignName: string | null;
};

export type BacktestPreview =
  // Conta sem nenhum insight ingerido: nao ha o que simular, e responder "0
  // disparos" ali seria vender a regra como silenciosa quando ela e so nao
  // testada.
  | { readonly kind: "sem-historico" }
  | {
      readonly kind: "ok";
      readonly since: string;
      readonly until: string;
      readonly firings: readonly BacktestFiringView[];
      readonly evaluatedDays: number;
      readonly totalDays: number;
    };

// O que a contagem quer dizer. Quatro respostas, porque "zero disparos" tem dois
// significados opostos -- regra calibrada ou regra que nunca teve como medir --
// e porque um numero cru nao ajuda quem nao sabe quantos disparos sao demais.
export type BacktestVerdict = "cega" | "silenciosa" | "saudavel" | "barulhenta";

// Mais de um disparo por semana de historico mensuravel e o limite. Acima disso
// a regra deixa de ser aviso e vira ruido de fundo: o alerta que chega toda
// semana e o alerta que ninguem abre. Expresso como fracao dos dias medidos, e
// nao como numero fixo, para uma conta com 20 dias de historico nao ser julgada
// pela mesma contagem de uma com 90.
const DIAS_POR_DISPARO_SAUDAVEL = 7;

export function backtestVerdict(firings: number, evaluatedDays: number): BacktestVerdict {
  if (evaluatedDays === 0) {
    return "cega";
  }
  if (firings === 0) {
    return "silenciosa";
  }

  return firings > evaluatedDays / DIAS_POR_DISPARO_SAUDAVEL ? "barulhenta" : "saudavel";
}

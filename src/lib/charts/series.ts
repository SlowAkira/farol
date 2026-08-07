export type SeriesDay = {
  readonly date: string;
  readonly hasData: boolean;
};

export type TrimmedSeries<T extends SeriesDay> = {
  readonly days: readonly T[];
  // Ultimo dia efetivamente medido, ou null quando o periodo inteiro esta sem
  // ingestao. E o que o rodape do grafico anuncia.
  readonly lastDataDate: string | null;
  // Quantos dias do fim do periodo ficaram de fora por nao terem dado.
  readonly trimmedDays: number;
};

// A ingestao roda com atraso: o fim do periodo escolhido quase sempre inclui
// dias que ainda nao foram medidos. Esses dias voltam do banco zerados, e plotar
// zero ali desenha uma queda a pique que nunca aconteceu -- o leitor ve colapso
// de gasto onde a verdade e "ainda nao sabemos". Cortar no ultimo dia medido e o
// unico jeito de o grafico nao afirmar isso; o que fica de fora vira o aviso
// "dados ate DD/MM" em vez de virar pixel.
export function trimToLastDataDay<T extends SeriesDay>(days: readonly T[]): TrimmedSeries<T> {
  let lastIndexWithData = -1;
  for (let index = days.length - 1; index >= 0; index -= 1) {
    if (days[index].hasData) {
      lastIndexWithData = index;
      break;
    }
  }

  if (lastIndexWithData === -1) {
    return { days: [], lastDataDate: null, trimmedDays: days.length };
  }

  return {
    days: days.slice(0, lastIndexWithData + 1),
    lastDataDate: days[lastIndexWithData].date,
    trimmedDays: days.length - (lastIndexWithData + 1),
  };
}

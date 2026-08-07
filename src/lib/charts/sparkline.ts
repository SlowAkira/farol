export type SparklinePoint = {
  readonly x: number;
  readonly y: number;
};

export type SparklineGeometry = {
  // Um subpath por sequencia continua de dias com valor. Dia sem valor (ROAS de
  // um dia sem gasto) interrompe a linha em vez de ser interpolado: unir os dois
  // lados desenharia uma tendencia que nao aconteceu.
  readonly paths: readonly string[];
  readonly lastPoint: SparklinePoint | null;
  readonly width: number;
  readonly height: number;
};

export type SparklineOptions = {
  readonly width: number;
  readonly height: number;
  // Folga para o traco e o ponto final nao serem cortados pela borda do viewBox.
  readonly padding: number;
};

const COORDINATE_PRECISION = 2;

function round(value: number): number {
  return Number(value.toFixed(COORDINATE_PRECISION));
}

// Serie de um dia so, ou toda constante, nao tem amplitude para escalar: fica na
// altura do meio, que e o unico lugar honesto (nao no topo nem no fundo, que
// sugeririam maximo ou minimo).
function verticalScale(value: number, min: number, max: number, options: SparklineOptions): number {
  const usableHeight = options.height - options.padding * 2;
  if (max === min) {
    return options.padding + usableHeight / 2;
  }

  const normalized = (value - min) / (max - min);
  return options.padding + usableHeight * (1 - normalized);
}

function horizontalScale(index: number, count: number, options: SparklineOptions): number {
  const usableWidth = options.width - options.padding * 2;
  if (count <= 1) {
    return options.padding + usableWidth / 2;
  }

  return options.padding + (usableWidth * index) / (count - 1);
}

export function sparklineGeometry(
  values: readonly (number | null)[],
  options: SparklineOptions,
): SparklineGeometry | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }

  const min = Math.min(...present);
  const max = Math.max(...present);

  const points = values.map((value, index) =>
    value === null
      ? null
      : {
          x: round(horizontalScale(index, values.length, options)),
          y: round(verticalScale(value, min, max, options)),
        },
  );

  const paths: string[] = [];
  let run: SparklinePoint[] = [];

  const flush = (): void => {
    if (run.length === 0) {
      return;
    }
    const [head, ...rest] = run;
    // Ponto isolado vira segmento de comprimento zero: com stroke-linecap
    // redondo ele aparece como um ponto, em vez de sumir do desenho.
    const tail = rest.length === 0 ? [head] : rest;
    paths.push(`M${head.x},${head.y}` + tail.map((point) => `L${point.x},${point.y}`).join(""));
    run = [];
  };

  for (const point of points) {
    if (point === null) {
      flush();
      continue;
    }
    run.push(point);
  }
  flush();

  const lastPoint = points.reduce<SparklinePoint | null>((last, point) => point ?? last, null);

  return { paths, lastPoint, width: options.width, height: options.height };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 86_400_000;

// O formato sozinho aceita "2026-02-30", que o Date acomoda virando 02/03 e faria
// a janela de ingestao pedir em silencio um dia que nao existe. Date aqui e so
// validador; o valor que circula continua sendo a string.
export function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertIsoDate(value: string): void {
  if (!isIsoDate(value)) {
    throw new RangeError(`Data invalida: "${value}". Use o formato YYYY-MM-DD.`);
  }
}

function toEpochDay(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / MS_PER_DAY;
}

function fromEpochDay(epochDay: number): string {
  return new Date(epochDay * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  assertIsoDate(date);
  return fromEpochDay(toEpochDay(date) + days);
}

// Mesmo epoch-day de addDays, na direcao contraria: quantos dias corridos
// separam duas datas de calendario, sem cruzar fuso nenhum.
export function daysBetween(start: string, end: string): number {
  assertIsoDate(start);
  assertIsoDate(end);
  return toEpochDay(end) - toEpochDay(start);
}

// Montado a partir de formatToParts em vez de formatar direto: a ordem dos campos
// e o separador dependem do locale de quem roda o processo, e "06/08/2026" no
// lugar de "2026-08-06" so apareceria na maquina errada.
const partsFormatter = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatter.get(timeZone);
  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  partsFormatter.set(timeZone, formatter);
  return formatter;
}

// "Hoje" precisa ser o hoje da conta de anuncios, nao o do servidor: uma conta em
// America/Sao_Paulo passa 3 horas do dia num dia diferente do UTC, e a janela
// sairia deslocada justamente nas execucoes da madrugada.
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = formatterFor(timeZone).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

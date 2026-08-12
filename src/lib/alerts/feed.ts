import { AlertStatus } from "@/generated/prisma/enums";
import { isoDateIn } from "@/lib/dates";

// Como o feed se organiza: aberto em cima, resolvido embaixo, e dentro de cada
// um os dias do mais recente para o mais antigo. Fica fora do componente porque
// e ordenacao de dado, e porque o dia de um alerta depende do fuso da conta de
// anuncios -- decidir isso no JSX traria o fuso do servidor para dentro do
// agrupamento.

export type FeedAlert = {
  readonly id: string;
  readonly status: AlertStatus;
  readonly triggeredAt: Date;
  readonly resolvedAt: Date | null;
};

export type FeedGroup<T extends FeedAlert> = {
  readonly day: string;
  readonly alerts: readonly T[];
};

export type FeedSections<T extends FeedAlert> = {
  // OPEN e MUTED juntos: silenciar diz "pare de me avisar", nao "o problema
  // passou". Jogar o silenciado para baixo de resolvido apagaria da tela uma
  // degradacao que continua acontecendo -- ele fica na secao de cima, com selo
  // proprio e depois dos que ainda avisam.
  readonly abertos: readonly FeedGroup<T>[];
  readonly resolvidos: readonly FeedGroup<T>[];
};

// Resolvido se agrupa pelo dia em que fechou, nao pelo em que abriu: quem varre
// a secao de baixo esta perguntando "o que saiu do ar", e um alerta que abriu em
// julho e fechou ontem pertence a ontem.
function diaDoAlerta(alert: FeedAlert, timezone: string): string {
  const instante =
    alert.status === AlertStatus.RESOLVED ? (alert.resolvedAt ?? alert.triggeredAt) : alert.triggeredAt;
  return isoDateIn(timezone, instante);
}

function instanteDeOrdenacao(alert: FeedAlert): number {
  const instante = alert.status === AlertStatus.RESOLVED ? (alert.resolvedAt ?? alert.triggeredAt) : alert.triggeredAt;
  return instante.getTime();
}

// Silenciado por ultimo dentro do dia; entre pares, o mais recente primeiro.
function compararNoDia(a: FeedAlert, b: FeedAlert): number {
  const silenciado = Number(a.status === AlertStatus.MUTED) - Number(b.status === AlertStatus.MUTED);
  return silenciado !== 0 ? silenciado : instanteDeOrdenacao(b) - instanteDeOrdenacao(a);
}

function agrupar<T extends FeedAlert>(alerts: readonly T[], timezone: string): readonly FeedGroup<T>[] {
  const porDia = new Map<string, T[]>();

  for (const alert of alerts) {
    const day = diaDoAlerta(alert, timezone);
    const lista = porDia.get(day);
    if (lista === undefined) {
      porDia.set(day, [alert]);
      continue;
    }
    lista.push(alert);
  }

  return [...porDia.entries()]
    // YYYY-MM-DD ordena lexicograficamente na ordem do calendario, entao o mais
    // recente primeiro e so inverter a comparacao de string.
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([day, lista]) => ({ day, alerts: [...lista].sort(compararNoDia) }));
}

export function splitAlertFeed<T extends FeedAlert>(
  alerts: readonly T[],
  timezone: string,
): FeedSections<T> {
  return {
    abertos: agrupar(
      alerts.filter((alert) => alert.status !== AlertStatus.RESOLVED),
      timezone,
    ),
    resolvidos: agrupar(
      alerts.filter((alert) => alert.status === AlertStatus.RESOLVED),
      timezone,
    ),
  };
}

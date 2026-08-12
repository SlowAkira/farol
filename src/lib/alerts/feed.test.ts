import { describe, expect, it } from "vitest";
import { AlertStatus } from "@/generated/prisma/enums";
import { splitAlertFeed, type FeedAlert } from "./feed";

const FUSO = "America/Sao_Paulo";

function alerta(
  id: string,
  status: AlertStatus,
  triggeredAt: string,
  resolvedAt: string | null = null,
): FeedAlert {
  return {
    id,
    status,
    triggeredAt: new Date(triggeredAt),
    resolvedAt: resolvedAt === null ? null : new Date(resolvedAt),
  };
}

function ids(grupos: readonly { readonly alerts: readonly FeedAlert[] }[]): string[][] {
  return grupos.map((grupo) => grupo.alerts.map((alerta) => alerta.id));
}

describe("splitAlertFeed", () => {
  it("separa aberto de resolvido", () => {
    const { abertos, resolvidos } = splitAlertFeed(
      [
        alerta("a", AlertStatus.OPEN, "2026-08-05T12:00:00Z"),
        alerta("b", AlertStatus.RESOLVED, "2026-08-01T12:00:00Z", "2026-08-04T12:00:00Z"),
      ],
      FUSO,
    );

    expect(ids(abertos)).toEqual([["a"]]);
    expect(ids(resolvidos)).toEqual([["b"]]);
  });

  // Silenciar diz "pare de me avisar", nao "o problema passou": o alerta fica na
  // secao de cima, depois dos que ainda avisam.
  it("mantem o silenciado entre os abertos, no fim do dia", () => {
    const { abertos, resolvidos } = splitAlertFeed(
      [
        alerta("silenciado", AlertStatus.MUTED, "2026-08-05T18:00:00Z"),
        alerta("aberto", AlertStatus.OPEN, "2026-08-05T09:00:00Z"),
      ],
      FUSO,
    );

    expect(ids(abertos)).toEqual([["aberto", "silenciado"]]);
    expect(resolvidos).toEqual([]);
  });

  it("agrupa por dia, do mais recente para o mais antigo", () => {
    const { abertos } = splitAlertFeed(
      [
        alerta("velho", AlertStatus.OPEN, "2026-08-01T12:00:00Z"),
        alerta("novo", AlertStatus.OPEN, "2026-08-05T12:00:00Z"),
        alerta("meio", AlertStatus.OPEN, "2026-08-03T12:00:00Z"),
      ],
      FUSO,
    );

    expect(abertos.map((grupo) => grupo.day)).toEqual(["2026-08-05", "2026-08-03", "2026-08-01"]);
  });

  it("ordena o mais recente primeiro dentro do dia", () => {
    const { abertos } = splitAlertFeed(
      [
        alerta("manha", AlertStatus.OPEN, "2026-08-05T09:00:00Z"),
        alerta("tarde", AlertStatus.OPEN, "2026-08-05T20:00:00Z"),
      ],
      FUSO,
    );

    expect(ids(abertos)).toEqual([["tarde", "manha"]]);
  });

  // Quem varre a secao de baixo pergunta "o que saiu do ar", entao o dia que
  // importa e o do fechamento, nao o da abertura.
  it("agrupa o resolvido pelo dia em que fechou", () => {
    const { resolvidos } = splitAlertFeed(
      [alerta("a", AlertStatus.RESOLVED, "2026-07-02T12:00:00Z", "2026-08-05T12:00:00Z")],
      FUSO,
    );

    expect(resolvidos[0].day).toBe("2026-08-05");
  });

  it("cai no dia do disparo se o resolvido nao tem data de resolucao", () => {
    const { resolvidos } = splitAlertFeed(
      [alerta("a", AlertStatus.RESOLVED, "2026-07-02T12:00:00Z", null)],
      FUSO,
    );

    expect(resolvidos[0].day).toBe("2026-07-02");
  });

  // O dia e o da conta de anuncios: as 23h de Sao Paulo ja sao o dia seguinte em
  // UTC, e agrupar pelo fuso do servidor jogaria o alerta para o dia errado.
  it("agrupa no fuso da conta, e nao no do servidor", () => {
    const noite = "2026-08-06T01:00:00Z";

    expect(splitAlertFeed([alerta("a", AlertStatus.OPEN, noite)], FUSO).abertos[0].day).toBe(
      "2026-08-05",
    );
    expect(splitAlertFeed([alerta("a", AlertStatus.OPEN, noite)], "UTC").abertos[0].day).toBe(
      "2026-08-06",
    );
  });

  it("devolve as duas secoes vazias sem alerta nenhum", () => {
    expect(splitAlertFeed([], FUSO)).toEqual({ abertos: [], resolvidos: [] });
  });
});

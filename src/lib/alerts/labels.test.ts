import { describe, expect, it } from "vitest";
import { AlertComparison, AlertDirection, AlertScope } from "@/generated/prisma/enums";
import {
  alertDirectionOptions,
  ALERT_METRIC_OPTIONS,
  directionLabel,
  ruleSentence,
  type RuleShape,
} from "./labels";

const BRL = "BRL";

// O Intl separa simbolo de numero com NBSP; escrever o NBSP nos literais
// esperados deixaria o teste ilegivel sem provar nada a mais.
function semNbsp(texto: string): string {
  return texto.replace(/ /g, " ");
}

function regra(patch: Partial<RuleShape> = {}): RuleShape {
  return {
    metric: "CPA",
    comparison: AlertComparison.PCT_CHANGE,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.CAMPAIGN,
    threshold: 3000,
    windowDays: 7,
    ...patch,
  };
}

describe("ALERT_METRIC_OPTIONS", () => {
  it("usa o rotulo do catalogo de metricas, e nao uma copia", () => {
    expect(ALERT_METRIC_OPTIONS.find((opcao) => opcao.value === "ROAS")?.label).toBe("ROAS");
    expect(ALERT_METRIC_OPTIONS.find((opcao) => opcao.value === "SPEND")?.label).toBe("Gasto");
  });

  it("oferece as seis metricas de alerta", () => {
    expect(ALERT_METRIC_OPTIONS).toHaveLength(6);
  });
});

describe("directionLabel", () => {
  it("fala de movimento em variacao percentual", () => {
    expect(directionLabel(AlertComparison.PCT_CHANGE, AlertDirection.ABOVE)).toBe("Subiu mais que");
    expect(directionLabel(AlertComparison.PCT_CHANGE, AlertDirection.BELOW)).toBe("Caiu mais que");
  });

  it("fala de patamar em valor absoluto", () => {
    expect(directionLabel(AlertComparison.ABSOLUTE_THRESHOLD, AlertDirection.ABOVE)).toBe(
      "Acima de",
    );
    expect(directionLabel(AlertComparison.ABSOLUTE_THRESHOLD, AlertDirection.BELOW)).toBe(
      "Abaixo de",
    );
  });

  it("devolve as duas direcoes na ordem sobe, desce", () => {
    expect(alertDirectionOptions(AlertComparison.PCT_CHANGE).map((opcao) => opcao.value)).toEqual([
      AlertDirection.ABOVE,
      AlertDirection.BELOW,
    ]);
  });
});

describe("ruleSentence", () => {
  it("descreve variacao percentual por campanha", () => {
    expect(semNbsp(ruleSentence(regra(), BRL))).toBe(
      "CPA de qualquer campanha subindo mais de 30,00%, em 7 dias contra os 7 anteriores",
    );
  });

  it("descreve queda percentual da conta", () => {
    const frase = ruleSentence(
      regra({ metric: "ROAS", direction: AlertDirection.BELOW, scope: AlertScope.ACCOUNT }),
      BRL,
    );

    expect(semNbsp(frase)).toBe(
      "ROAS da conta caindo mais de 30,00%, em 7 dias contra os 7 anteriores",
    );
  });

  it("descreve limiar absoluto em dinheiro com a moeda da conta", () => {
    const frase = ruleSentence(
      regra({
        comparison: AlertComparison.ABSOLUTE_THRESHOLD,
        threshold: 6000,
        scope: AlertScope.ACCOUNT,
        windowDays: 14,
      }),
      BRL,
    );

    expect(semNbsp(frase)).toBe("CPA da conta acima de R$ 60,00, na janela de 14 dias");
  });

  it("descreve limiar absoluto em razao", () => {
    const frase = ruleSentence(
      regra({
        metric: "ROAS",
        comparison: AlertComparison.ABSOLUTE_THRESHOLD,
        direction: AlertDirection.BELOW,
        threshold: 250,
        scope: AlertScope.ACCOUNT,
      }),
      BRL,
    );

    expect(semNbsp(frase)).toBe("ROAS da conta abaixo de 2,50×, na janela de 7 dias");
  });
});

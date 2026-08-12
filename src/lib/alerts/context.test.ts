import { describe, expect, it } from "vitest";
import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import { parseAlertContext } from "./context";

const TOTAIS = {
  impressions: 100_000,
  clicks: 2_000,
  spendCents: 300_000,
  conversions: 100,
  conversionValueCents: 900_000,
  reach: 60_000,
};

// O mesmo formato que applyAlertChanges grava na coluna Json.
function bruto(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metric: AlertMetric.CPA,
    comparison: AlertComparison.PCT_CHANGE,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.CAMPAIGN,
    threshold: 3_000,
    windowDays: 7,
    campaign: { campaignId: "camp_1", campaignName: "Captação de Leads" },
    current: { period: { since: "2026-07-30", until: "2026-08-05" }, value: 2_980, totals: TOTAIS },
    previous: { period: { since: "2026-07-23", until: "2026-07-29" }, value: 1_840, totals: TOTAIS },
    deltaPercent: 61.95,
    ...overrides,
  };
}

describe("parseAlertContext", () => {
  it("le o context que o motor grava", () => {
    const context = parseAlertContext(bruto());

    expect(context).not.toBeNull();
    expect(context?.campaign?.campaignName).toBe("Captação de Leads");
    expect(context?.current.value).toBe(2_980);
  });

  it("aceita alerta de conta, que nao tem campanha", () => {
    const context = parseAlertContext(bruto({ scope: AlertScope.ACCOUNT, campaign: null }));
    expect(context?.campaign).toBeNull();
  });

  // Derivada sem denominador chega como null de verdade: e valor ausente, nao
  // context quebrado.
  it("aceita janela com valor nulo", () => {
    const context = parseAlertContext(
      bruto({
        previous: {
          period: { since: "2026-07-23", until: "2026-07-29" },
          value: null,
          totals: TOTAIS,
        },
      }),
    );

    expect(context?.previous.value).toBeNull();
  });

  it.each([
    ["nao e objeto", "alerta"],
    ["e nulo", null],
    ["e lista", []],
  ])("recusa context que %s", (_caso, valor) => {
    expect(parseAlertContext(valor)).toBeNull();
  });

  it.each([
    ["metric fora do enum", { metric: "CPX" }],
    ["comparison fora do enum", { comparison: "MAIOR_QUE" }],
    ["threshold em texto", { threshold: "3000" }],
    ["janela atual ausente", { current: undefined }],
    ["periodo mal formado", { current: { period: { since: "30/07", until: "05/08" }, value: 1, totals: TOTAIS } }],
    ["totais incompletos", { current: { period: { since: "2026-07-30", until: "2026-08-05" }, value: 1, totals: { impressions: 1 } } }],
  ])("recusa context com %s", (_caso, override) => {
    expect(parseAlertContext(bruto(override as Record<string, unknown>))).toBeNull();
  });
});

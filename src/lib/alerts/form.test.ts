import { describe, expect, it } from "vitest";
import { AlertComparison, AlertDirection, AlertScope } from "@/generated/prisma/enums";
import {
  parseRuleCondition,
  parseRuleForm,
  type RuleConditionValues,
  type RuleFormValues,
} from "./form";

function valores(patch: Partial<RuleFormValues> = {}): RuleFormValues {
  return {
    name: "CPA subindo na captação",
    metric: "CPA",
    comparison: AlertComparison.PCT_CHANGE,
    direction: AlertDirection.ABOVE,
    scope: AlertScope.CAMPAIGN,
    threshold: "30,00",
    windowDays: "7",
    ...patch,
  };
}

describe("parseRuleForm", () => {
  it("converte o formulario inteiro numa regra do banco", () => {
    const resultado = parseRuleForm(valores());

    expect(resultado).toEqual({
      ok: true,
      value: {
        name: "CPA subindo na captação",
        metric: "CPA",
        comparison: AlertComparison.PCT_CHANGE,
        direction: AlertDirection.ABOVE,
        scope: AlertScope.CAMPAIGN,
        threshold: 3000,
        windowDays: 7,
      },
    });
  });

  it("guarda 4500 quando a pessoa digita 45,00 em limiar de dinheiro", () => {
    const resultado = parseRuleForm(
      valores({ comparison: AlertComparison.ABSOLUTE_THRESHOLD, threshold: "45,00" }),
    );

    expect(resultado.ok && resultado.value.threshold).toBe(4500);
  });

  it("apara o nome e cobra que ele exista", () => {
    expect(parseRuleForm(valores({ name: "  Nome com folga  " }))).toMatchObject({
      ok: true,
      value: { name: "Nome com folga" },
    });

    const vazio = parseRuleForm(valores({ name: "   " }));
    expect(vazio.ok).toBe(false);
    expect(!vazio.ok && vazio.errors.name).toBeDefined();
  });

  it("recusa nome que nao cabe na lista", () => {
    const resultado = parseRuleForm(valores({ name: "a".repeat(81) }));

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errors.name).toContain("80");
  });

  it("recusa enum que nao veio da lista, mesmo com o select restringindo na tela", () => {
    const resultado = parseRuleForm(valores({ metric: "LUCRO" }));

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errors.metric).toBeDefined();
  });

  it("recusa janela fora dos presets", () => {
    const resultado = parseRuleForm(valores({ windowDays: "5" }));

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errors.windowDays).toBeDefined();
  });

  it("devolve a mensagem do proprio parser de limiar", () => {
    const resultado = parseRuleForm(valores({ threshold: "45.00" }));

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errors.threshold).toContain("vírgula");
  });

  it("acumula os erros de campos independentes numa passada so", () => {
    const resultado = parseRuleForm(valores({ name: "", threshold: "" }));

    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && Object.keys(resultado.errors).sort()).toEqual(["name", "threshold"]);
  });

  // O limiar nao tem como ser lido sem saber a metrica e a comparacao, entao
  // metrica invalida nao pode virar tambem um erro de limiar inventado.
  it("nao inventa erro de limiar quando a metrica e invalida", () => {
    const resultado = parseRuleForm(valores({ metric: "LUCRO", threshold: "30,00" }));

    expect(!resultado.ok && resultado.errors.threshold).toBeUndefined();
  });
});

// So a condicao, sem o nome: e a forma que o preview manda para o servidor.
function condicao(patch: Partial<RuleFormValues> = {}): RuleConditionValues {
  const { metric, comparison, direction, scope, threshold, windowDays } = valores(patch);
  return { metric, comparison, direction, scope, threshold, windowDays };
}

describe("parseRuleCondition", () => {
  it("valida a condicao sem exigir nome, que e o que o preview simula", () => {
    expect(parseRuleCondition(condicao())).toMatchObject({ ok: true, value: { threshold: 3000 } });
  });

  it("recusa queda maior que 100%, que nenhuma metrica faz", () => {
    const resultado = parseRuleCondition(
      condicao({ direction: AlertDirection.BELOW, threshold: "120,00" }),
    );
    expect(resultado.ok).toBe(false);
    expect(!resultado.ok && resultado.errors.threshold).toContain("100%");
  });
});

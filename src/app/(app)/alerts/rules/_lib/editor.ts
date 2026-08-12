import {
  AlertComparison,
  AlertDirection,
  AlertMetric,
  AlertScope,
} from "@/generated/prisma/enums";
import { parseRuleCondition, type RuleFormValues } from "@/lib/alerts/form";
import { previewRuleBacktest } from "@/lib/alerts/preview";
import type { BacktestPreview } from "@/lib/alerts/preview-result";
import { formatThresholdInput } from "@/lib/alerts/threshold";
import type { AlertRuleRow } from "@/lib/db/alerts";

// A regra que o formulario propoe quando nao ha nada para editar: CPA subindo
// mais de 30% por campanha em 7 dias. E o alerta que um gestor de trafego
// configuraria primeiro, e cada campo default ja e defensavel sozinho -- o que
// importa e a pessoa ver um preview de verdade na primeira tela, em vez de um
// formulario em branco que so simula depois de seis escolhas.
export const VALORES_PADRAO: RuleFormValues = {
  name: "",
  metric: AlertMetric.CPA,
  comparison: AlertComparison.PCT_CHANGE,
  direction: AlertDirection.ABOVE,
  scope: AlertScope.CAMPAIGN,
  threshold: "30,00",
  windowDays: "7",
};

export function ruleToValues(rule: AlertRuleRow): RuleFormValues {
  return {
    name: rule.name,
    metric: rule.metric,
    comparison: rule.comparison,
    direction: rule.direction,
    scope: rule.scope,
    threshold: formatThresholdInput(rule.metric, rule.comparison, rule.threshold),
    windowDays: String(rule.windowDays),
  };
}

// Simulacao da configuracao inicial, feita no servidor. Chega junto do HTML: sem
// ela a tela abriria com esqueleto e uma ida ao servidor para calcular o que ja
// dava para calcular durante o render.
//
// `null` so quando a condicao inicial nao e valida, o que nao acontece nem com
// os valores padrao nem com uma regra ja gravada. O nome nao entra: a regra nova
// abre sem nome e ainda assim ja mostra a simulacao.
export async function previewInicial(
  adAccountId: string,
  values: RuleFormValues,
): Promise<BacktestPreview | null> {
  const parsed = parseRuleCondition(values);
  if (!parsed.ok) {
    return null;
  }

  return previewRuleBacktest(adAccountId, { id: "", ...parsed.value });
}

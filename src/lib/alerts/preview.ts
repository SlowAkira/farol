import { AlertScope } from "@/generated/prisma/enums";
import { addDays } from "@/lib/dates";
import {
  getAccountLastDataDate,
  getCampaignDailySeries,
  getDailySeries,
} from "@/lib/db/insights";
import { backtestRule, type BacktestSeries } from "./backtest";
import { BACKTEST_DAYS, type BacktestPreview } from "./preview-result";
import type { EvaluableRule } from "./rules";

// A forma do resultado e o veredito moram em ./preview-result, que nao importa
// nada: e de la que o formulario (client) le, sem arrastar o Prisma junto.

// Le o historico da conta e roda a simulacao. A separacao segue a mesma de
// engine.ts: as consultas ficam aqui, a decisao de disparo fica em backtest.ts,
// que e puro e testado sem banco.
export async function previewRuleBacktest(
  adAccountId: string,
  rule: EvaluableRule,
): Promise<BacktestPreview> {
  // Ancora no ultimo dia medido, e nao em hoje: a ingestao roda com atraso, e
  // simular ate hoje encheria o fim da janela de dias sem dado que so diriam
  // "inavaliavel".
  const anchor = await getAccountLastDataDate(adAccountId);
  if (anchor === null) {
    return { kind: "sem-historico" };
  }

  const since = addDays(anchor, -(BACKTEST_DAYS - 1));
  // O primeiro dia simulado ja precisa da janela dele e da anterior por tras:
  // sem esta folga os primeiros disparos comparariam contra um periodo anterior
  // truncado, e um percentual calculado sobre meia janela infla.
  const dadosDesde = addDays(since, -2 * rule.windowDays);

  const series: readonly BacktestSeries[] =
    rule.scope === AlertScope.ACCOUNT
      ? [{ target: null, days: await getDailySeries(adAccountId, dadosDesde, anchor) }]
      : (await getCampaignDailySeries(adAccountId, dadosDesde, anchor)).map((campanha) => ({
          target: { campaignId: campanha.campaignId, campaignName: campanha.name },
          days: campanha.days,
        }));

  const resultado = backtestRule({ rule, series, since, until: anchor });

  return {
    kind: "ok",
    since,
    until: anchor,
    firings: resultado.firings.map((firing) => ({
      date: firing.date,
      campaignName: firing.target?.campaignName ?? null,
    })),
    evaluatedDays: resultado.evaluatedDays,
    totalDays: resultado.totalDays,
  };
}

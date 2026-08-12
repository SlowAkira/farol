import { AlertScope, AlertStatus } from "@/generated/prisma/enums";
import {
  applyAlertChanges,
  listActiveAlerts,
  listEnabledRules,
  type AlertToOpen,
  type EnabledRule,
} from "@/lib/db/alerts";
import { getAccountTotals, getCampaignBreakdown, getPreviousPeriod, type Period } from "@/lib/db/insights";
import { addDays, isIsoDate } from "@/lib/dates";
import type { MetricTotals } from "@/lib/metrics/calc";
import { evaluateRule, fingerprintFor, type AlertTarget, type AlertWindow } from "./rules";

export type EvaluateSummary = {
  // Pares (regra, alvo) em que a condicao pode ser medida -- disparando ou nao.
  readonly evaluated: number;
  readonly opened: number;
  readonly resolved: number;
  // Pares em que nao deu para medir: pouco volume, metrica indisponivel ou base
  // zero. Contados a parte porque "nao disparou" e "nao deu para saber" sao
  // coisas diferentes, e so a primeira resolve alerta aberto.
  readonly suppressed: number;
};

const NADA_A_FAZER: EvaluateSummary = { evaluated: 0, opened: 0, resolved: 0, suppressed: 0 };

const SEM_ENTREGA: MetricTotals = {
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  conversionValueCents: 0,
  reach: 0,
};

type ScopedWindow = {
  readonly target: AlertTarget | null;
  readonly current: AlertWindow;
  readonly previous: AlertWindow;
};

type WindowData = {
  readonly account: ScopedWindow | null;
  readonly campaigns: readonly ScopedWindow[];
};

async function loadCampaignWindows(
  adAccountId: string,
  current: Period,
  previous: Period,
): Promise<ScopedWindow[]> {
  const atual = await getCampaignBreakdown(adAccountId, current.since, current.until);
  const anterior = await getCampaignBreakdown(adAccountId, previous.since, previous.until);
  const totaisAnteriores = new Map(anterior.map((row) => [row.campaignId, row.totals]));

  // Percorre as campanhas da janela atual, e nao a uniao das duas: campanha que
  // parou de entregar nao tem numero novo para julgar, e inventar uma linha
  // zerada para ela transformaria "parou" em "despencou".
  return atual.map((row) => ({
    target: { campaignId: row.campaignId, campaignName: row.name },
    current: { period: current, totals: row.totals },
    previous: {
      period: previous,
      totals: totaisAnteriores.get(row.campaignId) ?? SEM_ENTREGA,
    },
  }));
}

async function loadWindow(
  adAccountId: string,
  asOf: string,
  windowDays: number,
  scopes: ReadonlySet<AlertScope>,
): Promise<WindowData> {
  const current: Period = { since: addDays(asOf, -(windowDays - 1)), until: asOf };
  const previous = getPreviousPeriod(current.since, current.until);

  const account = scopes.has(AlertScope.ACCOUNT)
    ? {
        target: null,
        current: {
          period: current,
          totals: await getAccountTotals(adAccountId, current.since, current.until),
        },
        previous: {
          period: previous,
          totals: await getAccountTotals(adAccountId, previous.since, previous.until),
        },
      }
    : null;

  const campaigns = scopes.has(AlertScope.CAMPAIGN)
    ? await loadCampaignWindows(adAccountId, current, previous)
    : [];

  return { account, campaigns };
}

// Uma busca por janela distinta, e nao uma por regra: tres regras de 7, 7 e 30
// dias fazem duas rodadas de agregacao, nao tres.
async function loadWindows(
  adAccountId: string,
  asOf: string,
  rules: readonly EnabledRule[],
): Promise<Map<number, WindowData>> {
  const scopesByWindow = new Map<number, Set<AlertScope>>();
  for (const rule of rules) {
    const scopes = scopesByWindow.get(rule.windowDays) ?? new Set<AlertScope>();
    scopes.add(rule.scope);
    scopesByWindow.set(rule.windowDays, scopes);
  }

  const windows = new Map<number, WindowData>();
  for (const [windowDays, scopes] of scopesByWindow) {
    windows.set(windowDays, await loadWindow(adAccountId, asOf, windowDays, scopes));
  }

  return windows;
}

function targetsFor(rule: EnabledRule, window: WindowData): readonly ScopedWindow[] {
  if (rule.scope === AlertScope.ACCOUNT) {
    return window.account === null ? [] : [window.account];
  }

  return window.campaigns;
}

export async function evaluateRules(adAccountId: string, asOf: string): Promise<EvaluateSummary> {
  // Mesma exigencia de assertPeriod em src/lib/db/insights.ts: data mal formada
  // aqui e defeito de quem chamou, nao erro de dominio do alerta.
  if (!isIsoDate(asOf)) {
    throw new RangeError(`asOf invalido: "${asOf}". Use o formato YYYY-MM-DD.`);
  }

  // So regra habilitada entra, e isso vale tambem para a resolucao: alerta que
  // uma regra desligada deixou aberto fica como esta. Desligar a regra diz que
  // ninguem quer mais ser avisado, e nao que o problema passou -- e resolver
  // sozinho apagaria da tela algo que continua acontecendo.
  const rules = await listEnabledRules(adAccountId);
  if (rules.length === 0) {
    return NADA_A_FAZER;
  }

  const windows = await loadWindows(adAccountId, asOf, rules);
  const active = await listActiveAlerts(rules.map((rule) => rule.id));
  const activeByFingerprint = new Map(active.map((alert) => [alert.fingerprint, alert]));

  const toOpen: AlertToOpen[] = [];
  const toResolve: string[] = [];
  let evaluated = 0;
  let suppressed = 0;

  for (const rule of rules) {
    const window = windows.get(rule.windowDays);
    if (window === undefined) {
      continue;
    }

    for (const { target, current, previous } of targetsFor(rule, window)) {
      const outcome = evaluateRule({ rule, target, current, previous });

      if (outcome.kind === "unevaluable") {
        suppressed += 1;
        continue;
      }

      evaluated += 1;

      const campaignId = target?.campaignId ?? null;
      const fingerprint = fingerprintFor(rule.id, campaignId, rule.direction);
      const emAberto = activeByFingerprint.get(fingerprint);

      if (outcome.kind === "fired") {
        // Alerta ja aberto (ou silenciado) para esta mesma condicao nao vira
        // outro: o disparo identifica o problema, e nao a execucao que o viu.
        if (emAberto === undefined) {
          toOpen.push({ ruleId: rule.id, campaignId, fingerprint, context: outcome.context });
        }
        continue;
      }

      if (emAberto?.status === AlertStatus.OPEN) {
        toResolve.push(fingerprint);
      }
    }
  }

  const applied = await applyAlertChanges({ toOpen, toResolve });

  return { evaluated, opened: applied.opened, resolved: applied.resolved, suppressed };
}

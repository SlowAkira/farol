import {
  AlertStatus,
  type AlertComparison,
  type AlertDirection,
  type AlertMetric,
  type AlertScope,
} from "@/generated/prisma/enums";
import { parseAlertContext } from "@/lib/alerts/context";
import type { AlertContext } from "@/lib/alerts/rules";
import { getPrisma } from "./client";

export type EnabledRule = {
  readonly id: string;
  readonly metric: AlertMetric;
  readonly comparison: AlertComparison;
  readonly direction: AlertDirection;
  readonly scope: AlertScope;
  readonly threshold: number;
  readonly windowDays: number;
};

export async function listEnabledRules(adAccountId: string): Promise<EnabledRule[]> {
  return getPrisma().alertRule.findMany({
    where: { adAccountId, enabled: true },
    select: {
      id: true,
      metric: true,
      comparison: true,
      direction: true,
      scope: true,
      threshold: true,
      windowDays: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

// OPEN e MUTED juntos porque os dois impedem abrir alerta novo: um porque o
// problema ja esta na tela, outro porque alguem mandou parar de avisar. Sao os
// dois estados em que o fingerprint ainda esta "ocupado".
export type ActiveAlert = {
  readonly id: string;
  readonly fingerprint: string;
  readonly status: AlertStatus;
};

export async function listActiveAlerts(ruleIds: readonly string[]): Promise<ActiveAlert[]> {
  if (ruleIds.length === 0) {
    return [];
  }

  return getPrisma().alert.findMany({
    where: {
      ruleId: { in: [...ruleIds] },
      status: { in: [AlertStatus.OPEN, AlertStatus.MUTED] },
    },
    select: { id: true, fingerprint: true, status: true },
  });
}

export type AlertToOpen = {
  readonly ruleId: string;
  readonly campaignId: string | null;
  readonly fingerprint: string;
  readonly context: AlertContext;
};

export type AlertChanges = {
  readonly toOpen: readonly AlertToOpen[];
  // Fingerprints, e nao ids: e a condicao que deixou de valer, e fechar por
  // condicao fecha tambem a duplicata que duas avaliacoes simultaneas da mesma
  // conta poderiam ter aberto. Fechar por id deixaria a copia aberta para
  // sempre, porque a passada seguinte so enxerga um alerta por fingerprint.
  readonly toResolve: readonly string[];
};

export type AppliedAlertChanges = {
  readonly opened: number;
  readonly resolved: number;
};

// Abrir e resolver na mesma transacao: as duas coisas descrevem uma unica
// passada do motor, e meia passada gravada deixaria a lista de alertas contando
// uma historia que nenhum periodo produziu.
export async function applyAlertChanges({
  toOpen,
  toResolve,
}: AlertChanges): Promise<AppliedAlertChanges> {
  if (toOpen.length === 0 && toResolve.length === 0) {
    return { opened: 0, resolved: 0 };
  }

  const resolvedAt = new Date();

  return getPrisma().$transaction(async (tx) => {
    const opened =
      toOpen.length === 0
        ? 0
        : (
            await tx.alert.createMany({
              data: toOpen.map((alert) => ({
                ruleId: alert.ruleId,
                campaignId: alert.campaignId,
                fingerprint: alert.fingerprint,
                context: alert.context,
              })),
            })
          ).count;

    // O `status: OPEN` no where nao e redundante: entre a leitura e a escrita
    // alguem pode ter silenciado o alerta, e silenciado nao volta a resolvido.
    const resolved =
      toResolve.length === 0
        ? 0
        : (
            await tx.alert.updateMany({
              where: { fingerprint: { in: [...toResolve] }, status: AlertStatus.OPEN },
              data: { status: AlertStatus.RESOLVED, resolvedAt },
            })
          ).count;

    return { opened, resolved };
  });
}

const RULE_SELECT = {
  id: true,
  name: true,
  metric: true,
  comparison: true,
  direction: true,
  scope: true,
  threshold: true,
  windowDays: true,
  enabled: true,
} as const;

export type AlertRuleRow = EnabledRule & {
  readonly name: string;
  readonly enabled: boolean;
};

export async function listAlertRules(adAccountId: string): Promise<AlertRuleRow[]> {
  return getPrisma().alertRule.findMany({
    where: { adAccountId },
    select: RULE_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

// O `userId` no where nao e conveniencia: e ele que impede editar regra alheia
// mandando o id na server action. Toda funcao de escrita abaixo passa por ele, e
// nenhuma aceita o id sozinho.
export async function getAlertRule(ruleId: string, userId: string): Promise<AlertRuleRow | null> {
  return getPrisma().alertRule.findFirst({
    where: { id: ruleId, userId },
    select: RULE_SELECT,
  });
}

export type AlertFeedRow = {
  readonly id: string;
  readonly status: AlertStatus;
  readonly triggeredAt: Date;
  readonly resolvedAt: Date | null;
  readonly ruleName: string;
  readonly campaignName: string | null;
  // null quando o Json da coluna nao passa pela validacao de parseAlertContext.
  // O alerta continua na lista: existe um disparo, e some-lo esconderia um
  // problema real so porque o formato dos numeros envelheceu.
  readonly context: AlertContext | null;
};

// Teto na consulta, e nao na tela: uma conta com anos de historico traria
// dezenas de milhares de linhas para montar um feed que ninguem rola ate o fim.
// Cai nos mais recentes, que sao os que importam.
export const ALERT_FEED_LIMIT = 200;

export async function listAlertFeed(adAccountId: string): Promise<AlertFeedRow[]> {
  const alerts = await getPrisma().alert.findMany({
    where: { rule: { adAccountId } },
    select: {
      id: true,
      status: true,
      triggeredAt: true,
      resolvedAt: true,
      context: true,
      rule: { select: { name: true } },
      campaign: { select: { name: true } },
    },
    orderBy: { triggeredAt: "desc" },
    take: ALERT_FEED_LIMIT,
  });

  return alerts.map((alert) => ({
    id: alert.id,
    status: alert.status,
    triggeredAt: alert.triggeredAt,
    resolvedAt: alert.resolvedAt,
    ruleName: alert.rule.name,
    campaignName: alert.campaign?.name ?? null,
    context: parseAlertContext(alert.context),
  }));
}

// Quantos alertas cada regra tem abertos agora. Usado na lista de regras para
// dizer o que a regra esta produzindo, e nao so como ela esta configurada.
export async function countOpenAlertsByRule(adAccountId: string): Promise<Record<string, number>> {
  const grouped = await getPrisma().alert.groupBy({
    by: ["ruleId"],
    where: { rule: { adAccountId }, status: { in: [AlertStatus.OPEN, AlertStatus.MUTED] } },
    _count: { _all: true },
  });

  return Object.fromEntries(grouped.map((row) => [row.ruleId, row._count._all]));
}

// Silenciar e resolver sao a mesma escrita com destino diferente, e as duas
// partem de OPEN: resolvido nao volta a silenciado nem vice-versa pela tela.
// `false` quando nada casou -- alerta de outro dono, id inventado ou alerta que
// ja saiu de OPEN entre o render e o clique.
export async function setAlertStatus(
  alertId: string,
  userId: string,
  status: typeof AlertStatus.MUTED | typeof AlertStatus.RESOLVED,
): Promise<boolean> {
  const { count } = await getPrisma().alert.updateMany({
    where: { id: alertId, status: AlertStatus.OPEN, rule: { userId } },
    data: {
      status,
      // resolvedAt so faz sentido em resolvido: silenciado continua aberto, e
      // carimbar data de resolucao nele faria o feed agrupa-lo pelo dia errado.
      ...(status === AlertStatus.RESOLVED ? { resolvedAt: new Date() } : {}),
    },
  });

  return count > 0;
}

export type AlertRuleInput = {
  readonly name: string;
  readonly metric: AlertMetric;
  readonly comparison: AlertComparison;
  readonly direction: AlertDirection;
  readonly scope: AlertScope;
  readonly threshold: number;
  readonly windowDays: number;
};

export type SaveRuleResult =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly code: "NOME_DUPLICADO" | "NAO_ENCONTRADA" };

// P2002 e a violacao de @@unique([userId, name]). Vira valor de retorno porque
// nome repetido e decisao do usuario, nao defeito: quem chamou mostra a
// mensagem no campo do nome em vez de derrubar a pagina.
function ehNomeDuplicado(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function createAlertRule(
  userId: string,
  adAccountId: string,
  input: AlertRuleInput,
): Promise<SaveRuleResult> {
  try {
    const rule = await getPrisma().alertRule.create({
      data: { ...input, userId, adAccountId },
      select: { id: true },
    });
    return { ok: true, id: rule.id };
  } catch (error) {
    if (ehNomeDuplicado(error)) {
      return { ok: false, code: "NOME_DUPLICADO" };
    }
    throw error;
  }
}

export async function updateAlertRule(
  ruleId: string,
  userId: string,
  input: AlertRuleInput,
): Promise<SaveRuleResult> {
  try {
    // updateMany, e nao update: e a unica forma de o `userId` entrar no where sem
    // uma leitura antes, e sem ele o id sozinho editaria regra de outro dono.
    const { count } = await getPrisma().alertRule.updateMany({
      where: { id: ruleId, userId },
      data: input,
    });

    return count > 0 ? { ok: true, id: ruleId } : { ok: false, code: "NAO_ENCONTRADA" };
  } catch (error) {
    if (ehNomeDuplicado(error)) {
      return { ok: false, code: "NOME_DUPLICADO" };
    }
    throw error;
  }
}

export async function setAlertRuleEnabled(
  ruleId: string,
  userId: string,
  enabled: boolean,
): Promise<boolean> {
  const { count } = await getPrisma().alertRule.updateMany({
    where: { id: ruleId, userId },
    data: { enabled },
  });

  return count > 0;
}

// O onDelete: Cascade do schema leva os alertas da regra junto. E o
// comportamento certo: alerta e o disparo de uma regra, e sem a regra ele nao
// tem como se explicar na tela.
export async function deleteAlertRule(ruleId: string, userId: string): Promise<boolean> {
  const { count } = await getPrisma().alertRule.deleteMany({ where: { id: ruleId, userId } });
  return count > 0;
}

// Uma conta so aceita regra do proprio dono. Confirmado antes de gravar porque
// o adAccountId chega do formulario, e formulario e editavel.
export async function accountBelongsToUser(adAccountId: string, userId: string): Promise<boolean> {
  const account = await getPrisma().adAccount.findFirst({
    where: { id: adAccountId, userId },
    select: { id: true },
  });

  return account !== null;
}

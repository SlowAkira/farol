import {
  AlertStatus,
  type AlertComparison,
  type AlertDirection,
  type AlertMetric,
  type AlertScope,
} from "@/generated/prisma/enums";
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

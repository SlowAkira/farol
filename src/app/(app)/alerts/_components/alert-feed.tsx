import { BellRing } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertScope } from "@/generated/prisma/enums";
import { splitAlertFeed, type FeedGroup } from "@/lib/alerts/feed";
import { mergeSeries, type DayTotals } from "@/lib/alerts/series";
import { listAlertFeed, type AlertFeedRow } from "@/lib/db/alerts";
import { getCampaignDailySeries } from "@/lib/db/insights";
import { formatDay } from "@/lib/format";
import { alertsHref } from "../_lib/account";
import { AlertCard, type AlertCardData } from "./alert-card";

type Conta = {
  readonly id: string;
  readonly currency: string;
  readonly timezone: string;
};

// Intervalo que os mini graficos precisam: da janela anterior mais antiga ate a
// janela atual mais recente entre todos os alertas. Uma consulta so para o feed
// inteiro, em vez de uma por cartao.
function intervaloDosGraficos(alerts: readonly AlertFeedRow[]): {
  since: string;
  until: string;
} | null {
  const periodos = alerts
    .map((alerta) => alerta.context)
    .filter((context) => context !== null)
    .map((context) => ({
      since: context.previous.period.since,
      until: context.current.period.until,
    }));

  if (periodos.length === 0) {
    return null;
  }

  return {
    since: periodos.reduce((menor, periodo) => (periodo.since < menor ? periodo.since : menor), periodos[0].since),
    until: periodos.reduce((maior, periodo) => (periodo.until > maior ? periodo.until : maior), periodos[0].until),
  };
}

// A serie de cada alerta: a da campanha que disparou, ou a soma de todas quando
// o alerta e da conta inteira. O merge acontece uma vez, e nao por cartao.
function seriePorAlerta(
  alerts: readonly AlertFeedRow[],
  porCampanha: ReadonlyMap<string, readonly DayTotals[]>,
  daConta: readonly DayTotals[],
): readonly AlertCardData[] {
  return alerts.map((alerta) => {
    const campaignId = alerta.context?.campaign?.campaignId;
    const doAlvo =
      alerta.context?.scope === AlertScope.CAMPAIGN && campaignId !== undefined
        ? (porCampanha.get(campaignId) ?? [])
        : daConta;

    return { ...alerta, days: doAlvo };
  });
}

function Grupo({
  grupo,
  currency,
  readOnlyMessage,
}: {
  grupo: FeedGroup<AlertCardData>;
  currency: string;
  readOnlyMessage: string | null;
}) {
  return (
    <section className="flex flex-col gap-3">
      {/* Data em portugues, como manda o CLAUDE.md: o ISO vale na URL e no
          banco, nao no cabecalho que uma pessoa le. */}
      <h3 className="text-label font-medium text-muted-foreground">{formatDay(grupo.day)}</h3>
      <div className="flex flex-col gap-3">
        {grupo.alerts.map((alerta) => (
          <AlertCard
            key={alerta.id}
            alerta={alerta}
            currency={currency}
            readOnlyMessage={readOnlyMessage}
          />
        ))}
      </div>
    </section>
  );
}

function Secao({
  titulo,
  descricao,
  grupos,
  currency,
  readOnlyMessage,
}: {
  titulo: string;
  descricao: string;
  grupos: readonly FeedGroup<AlertCardData>[];
  currency: string;
  readOnlyMessage: string | null;
}) {
  if (grupos.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lead font-semibold">{titulo}</h2>
        <p className="text-body text-muted-foreground">{descricao}</p>
      </div>
      <div className="flex flex-col gap-6">
        {grupos.map((grupo) => (
          <Grupo
            key={grupo.day}
            grupo={grupo}
            currency={currency}
            readOnlyMessage={readOnlyMessage}
          />
        ))}
      </div>
    </section>
  );
}

export async function AlertFeed({
  account,
  readOnlyMessage,
  temRegra,
}: {
  account: Conta;
  readOnlyMessage: string | null;
  temRegra: boolean;
}) {
  const alerts = await listAlertFeed(account.id);

  if (alerts.length === 0) {
    // Dois vazios diferentes, e a diferenca e o que fazer a seguir: sem regra
    // cadastrada nada pode disparar, e a acao e criar a primeira; com regra no
    // ar, silencio e boa noticia e nao ha o que fazer.
    return (
      <Card>
        <CardContent>
          {temRegra ? (
            <EmptyState
              icon={BellRing}
              titulo="Nenhum alerta nesta conta"
              descricao="As regras estão no ar e nenhuma delas encontrou anomalia até agora. O Farol avalia todas ao final de cada sincronização e o que disparar aparece aqui."
              acao={
                <Button asChild variant="outline" size="sm">
                  <Link href={alertsHref("/alerts/rules", account.id)}>Ver as regras</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={BellRing}
              titulo="Nenhuma regra de alerta cadastrada"
              descricao="Sem regra não há o que disparar. Crie a primeira regra para o Farol avisar quando o CPA subir, o ROAS cair ou o gasto fugir do esperado — antes de gravar, o preview mostra quantas vezes ela teria disparado nos últimos 90 dias."
              acao={
                <Button asChild size="sm">
                  <Link href={alertsHref("/alerts/rules/new", account.id)}>
                    Criar a primeira regra
                  </Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    );
  }

  const intervalo = intervaloDosGraficos(alerts);
  const series =
    intervalo === null
      ? []
      : await getCampaignDailySeries(account.id, intervalo.since, intervalo.until);

  const porCampanha = new Map(series.map((serie) => [serie.campaignId, serie.days]));
  const daConta = mergeSeries(series.map((serie) => serie.days));

  const { abertos, resolvidos } = splitAlertFeed(
    seriePorAlerta(alerts, porCampanha, daConta),
    account.timezone,
  );

  return (
    <div className="flex flex-col gap-10">
      <Secao
        titulo="Abertos"
        descricao="Condições que ainda estão valendo. Silenciar para de avisar sem fechar o alerta; resolver fecha."
        grupos={abertos}
        currency={account.currency}
        readOnlyMessage={readOnlyMessage}
      />
      <Secao
        titulo="Resolvidos"
        descricao="Alertas que deixaram de valer, agrupados pelo dia em que fecharam."
        grupos={resolvidos}
        currency={account.currency}
        readOnlyMessage={readOnlyMessage}
      />
    </div>
  );
}

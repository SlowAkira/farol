import { BellOff, CircleCheck, TriangleAlert } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { AlertStatus } from "@/generated/prisma/enums";
import { metricByDay, sliceByDate, type DayTotals } from "@/lib/alerts/series";
import { alertTitle } from "@/lib/alerts/title";
import type { AlertFeedRow } from "@/lib/db/alerts";
import { alertMetricDefinition } from "@/lib/alerts/metrics";
import { formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertActions } from "./alert-actions";

// Largura do mini grafico em pixel, e nao em porcentagem: a sparkline nao pode
// esticar (esticar muda a inclinacao do traco, que e a unica coisa que ela diz).
const MINI_LARGURA = 200;
const MINI_ALTURA = 40;

// Aberto e ambar porque e degradacao -- o painel funciona, o resultado nao.
// Silenciado e resolvido sao cinza: nenhum dos dois pede acao agora, e gastar
// ambar neles apagaria a diferenca entre "olhe isto" e "ja foi visto".
const SELO = {
  [AlertStatus.OPEN]: {
    rotulo: "Aberto",
    icone: TriangleAlert,
    disco: "bg-alert-warning/10",
    cor: "text-alert-warning",
  },
  [AlertStatus.MUTED]: {
    rotulo: "Silenciado",
    icone: BellOff,
    disco: "bg-muted",
    cor: "text-muted-foreground",
  },
  [AlertStatus.RESOLVED]: {
    rotulo: "Resolvido",
    icone: CircleCheck,
    disco: "bg-muted",
    cor: "text-muted-foreground",
  },
} as const satisfies Record<
  AlertStatus,
  { rotulo: string; icone: typeof TriangleAlert; disco: string; cor: string }
>;

export type AlertCardData = AlertFeedRow & {
  // Serie diaria do alvo do alerta, ja recortada pela consulta ao intervalo que
  // interessa. O cartao so fatia e le a metrica; nao consulta nada.
  readonly days: readonly DayTotals[];
};

function MiniGrafico({ alerta }: { alerta: AlertCardData }) {
  const { context } = alerta;
  if (context === null) {
    return null;
  }

  // O periodo relevante e a janela que disparou mais a anterior, que e contra o
  // que ela foi comparada: so a janela atual mostraria o patamar sem a mudanca.
  const dias = sliceByDate(alerta.days, context.previous.period.since, context.current.period.until);
  const valores = metricByDay(dias, context.metric);

  if (valores.every((valor) => valor === null)) {
    return null;
  }

  const { label } = alertMetricDefinition(context.metric);
  const periodo = formatPeriod(context.previous.period.since, context.current.period.until);

  return (
    <figure className="flex flex-col gap-1.5">
      {/* Cor de serie, e nao cinza: aqui o traco e o dado do cartao, nao o
          contexto de um numero maior ao lado. */}
      <Sparkline
        values={valores}
        width={MINI_LARGURA}
        height={MINI_ALTURA}
        className="text-chart-1"
        label={`${label} de ${periodo}`}
      />
      <figcaption className="text-label text-muted-foreground tabular-nums">
        {label} · {periodo}
      </figcaption>
    </figure>
  );
}

export function AlertCard({
  alerta,
  currency,
  readOnlyMessage,
}: {
  alerta: AlertCardData;
  currency: string;
  readOnlyMessage: string | null;
}) {
  const selo = SELO[alerta.status];
  const Icone = selo.icone;
  const titulo = alertTitle(alerta.context, alerta.ruleName, currency);
  const podeAgir = alerta.status === AlertStatus.OPEN;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", selo.disco)}
          >
            <Icone className={cn("size-4.5", selo.cor)} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {/* h4 porque a secao e h2 e o dia e h3: o feed inteiro e uma unica
                arvore de titulos navegavel por leitor de tela, e repetir o nivel
                do dia aqui faria o cartao virar irmao da data, nao filho. */}
            <h4 className="text-body font-medium text-foreground">{titulo}</h4>
            <p className="text-label text-muted-foreground">
              {alerta.ruleName}
              {alerta.campaignName === null ? "" : ` · ${alerta.campaignName}`}
            </p>
          </div>
          {/* Selo em texto, e nao so a cor do icone: o estado precisa sobreviver
              a quem nao distingue ambar de cinza. */}
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-label text-muted-foreground">
            {selo.rotulo}
          </span>
        </div>

        <MiniGrafico alerta={alerta} />

        {podeAgir ? (
          <AlertActions alertId={alerta.id} readOnlyMessage={readOnlyMessage} />
        ) : null}
      </CardContent>
    </Card>
  );
}

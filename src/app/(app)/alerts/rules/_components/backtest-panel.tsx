import { CircleCheck, CircleHelp, TriangleAlert } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
// Do modulo puro, e nao de ./preview nem de ./backtest: os dois leem o banco por
// baixo, e este arquivo mora dentro de um componente client.
import {
  backtestVerdict,
  BACKTEST_DAYS,
  type BacktestPreview,
  type BacktestVerdict,
} from "@/lib/alerts/preview-result";
import { formatDay, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";

// Quantas datas cabem antes da lista virar parede. Doze e um disparo por semana
// ao longo dos 90 dias -- exatamente o ponto em que a regra ja e barulhenta, e a
// partir dali a contagem diz mais que a enumeracao.
const DATAS_VISIVEIS = 12;

type Tom = "neutro" | "bom" | "atencao";

const TOM_CLASS = {
  neutro: { disco: "bg-muted", icone: "text-muted-foreground" },
  bom: { disco: "bg-muted", icone: "text-muted-foreground" },
  atencao: { disco: "bg-alert-warning/10", icone: "text-alert-warning" },
} as const satisfies Record<Tom, { disco: string; icone: string }>;

const VEREDITO = {
  cega: {
    tom: "atencao",
    icone: CircleHelp,
    titulo: "Não deu para simular",
    texto:
      "Nenhum dia do período teve volume suficiente para medir esta métrica. A regra pode até estar certa, mas o histórico não prova nada sobre ela — considere uma janela maior ou uma métrica com mais volume por trás.",
  },
  silenciosa: {
    tom: "neutro",
    icone: CircleHelp,
    titulo: "Nenhum disparo",
    texto:
      "A regra teria ficado calada o período inteiro. Isso é bom se a conta esteve estável, e é sinal de limiar frouxo se você sabe que houve problema nesses meses.",
  },
  saudavel: {
    tom: "bom",
    icone: CircleCheck,
    titulo: "Volume saudável",
    texto:
      "É pouco o bastante para cada aviso ser lido, e o suficiente para a regra estar viva. Um alerta que chega raramente é um alerta que alguém abre.",
  },
  barulhenta: {
    tom: "atencao",
    icone: TriangleAlert,
    titulo: "Regra barulhenta",
    texto:
      "Mais de um disparo por semana. Nesse ritmo o aviso vira ruído de fundo e ninguém abre mais: aperte o limiar, alargue a janela ou troque a comparação para variação.",
  },
} as const satisfies Record<
  BacktestVerdict,
  { tom: Tom; icone: LucideIcon; titulo: string; texto: string }
>;

function Moldura({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle className="text-lead">Preview de {BACKTEST_DAYS} dias</CardTitle>
        {/* O que o preview e, em uma linha: sem isto o numero grande ali embaixo
            parece contagem de alertas reais, e nao de uma simulacao. */}
        <p className="text-body text-muted-foreground">
          Quantas vezes esta regra teria aberto um alerta se já estivesse no ar durante o histórico
          que o Farol tem desta conta.
        </p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type AvisoProps = {
  readonly tom: Tom;
  readonly icone: LucideIcon;
  readonly titulo: string;
  readonly texto: string;
};

function Aviso({ tom, icone: Icone, titulo, texto }: AvisoProps) {
  const classes = TOM_CLASS[tom];

  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", classes.disco)}
      >
        <Icone className={cn("size-4.5", classes.icone)} />
      </span>
      <div className="flex flex-col gap-1">
        {/* O veredito e texto, e nao so a cor do disco: ambar sozinho nao
            sobrevive ao daltonismo nem ao tema claro, onde ele reprova AA. */}
        <p className="text-body font-medium text-foreground">{titulo}</p>
        <p className="max-w-prose text-body text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}

function Datas({
  id,
  firings,
}: {
  id: string;
  firings: readonly { readonly date: string; readonly campaignName: string | null }[];
}) {
  const visiveis = firings.slice(0, DATAS_VISIVEIS);
  const restantes = firings.length - visiveis.length;

  return (
    <div className="flex flex-col gap-2">
      {/* Rotulo, e nao cabecalho: o titulo do cartao nao e um heading (CardTitle
          e uma div), e abrir um h3 aqui inventaria um nivel que a pagina nao
          tem. O aria-labelledby da a lista o mesmo nome sem mentir na arvore. */}
      <p id={id} className="text-label font-medium text-muted-foreground">
        Datas dos disparos
      </p>
      <ol aria-labelledby={id} className="flex flex-col gap-1.5">
        {visiveis.map((firing, indice) => (
          <li
            key={`${firing.date}-${firing.campaignName ?? ""}-${indice}`}
            className="flex flex-wrap items-baseline gap-x-2 text-body"
          >
            {/* Data em portugues e em largura constante: a coluna de datas so se
                le de relance se todas ocuparem o mesmo espaco. */}
            <span className="tabular-nums text-foreground">{formatDay(firing.date)}</span>
            {firing.campaignName === null ? null : (
              <span className="min-w-0 truncate text-muted-foreground">{firing.campaignName}</span>
            )}
          </li>
        ))}
      </ol>
      {restantes > 0 ? (
        <p className="text-label text-muted-foreground">
          e mais {restantes} {restantes === 1 ? "disparo" : "disparos"}
        </p>
      ) : null}
    </div>
  );
}

export type BacktestPanelState =
  | { readonly kind: "carregando" }
  // Configuracao incompleta ou invalida: o erro ja aparece no campo, e repetir a
  // mensagem aqui seria dizer duas vezes a mesma coisa.
  | { readonly kind: "invalido" }
  | { readonly kind: "erro"; readonly message: string }
  | { readonly kind: "pronto"; readonly preview: BacktestPreview };

export function BacktestPanel({ state }: { state: BacktestPanelState }) {
  const rotuloDasDatas = useId();

  if (state.kind === "carregando") {
    return (
      <Moldura>
        <div aria-hidden="true" className="flex flex-col gap-4">
          <Skeleton className="h-12 w-24" />
          <Skeleton className="h-5 w-full max-w-md" />
          <Skeleton className="h-5 w-full max-w-sm" />
        </div>
      </Moldura>
    );
  }

  if (state.kind === "invalido") {
    return (
      <Moldura>
        <p className="text-body text-muted-foreground">
          Complete a configuração acima e a simulação roda sozinha.
        </p>
      </Moldura>
    );
  }

  if (state.kind === "erro") {
    return (
      <Moldura>
        <p role="status" className="text-body text-muted-foreground">
          {state.message}
        </p>
      </Moldura>
    );
  }

  if (state.preview.kind === "sem-historico") {
    return (
      <Moldura>
        <Aviso
          tom="atencao"
          icone={CircleHelp}
          titulo="Sem histórico para simular"
          texto="Esta conta ainda não tem nenhum dia de métrica ingerido. A regra pode ser criada, mas só a primeira sincronização vai dizer se ela é barulhenta."
        />
      </Moldura>
    );
  }

  const { firings, evaluatedDays, since, until } = state.preview;
  const veredito = VEREDITO[backtestVerdict(firings.length, evaluatedDays)];

  return (
    <Moldura>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          {/* Figura proporcional e largura minima reservada: o numero vai de 0 a
              90 enquanto a pessoa mexe no limiar, e sem a reserva o texto ao lado
              andaria a cada digito. */}
          <p className="min-w-20 text-display font-semibold text-foreground">{firings.length}</p>
          <p className="text-body text-muted-foreground">
            {firings.length === 1 ? "disparo" : "disparos"} de {formatPeriod(since, until)} ·{" "}
            {evaluatedDays} {evaluatedDays === 1 ? "dia mensurável" : "dias mensuráveis"}
          </p>
        </div>

        <Aviso {...veredito} />

        {firings.length > 0 ? <Datas id={rotuloDasDatas} firings={firings} /> : null}
      </div>
    </Moldura>
  );
}

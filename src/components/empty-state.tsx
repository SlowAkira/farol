import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// "Alerta" nao e so uma cor mais forte: e o unico tom que usa o ambar, que o
// CLAUDE.md reserva a logo e ao icone de alerta. Vazio comum (periodo sem dado,
// conta sem campanha) e informacao, nao problema, e fica em cinza.
export type EmptyStateTone = "neutro" | "alerta";

const TONE_CLASS = {
  neutro: { circulo: "bg-muted", icone: "text-muted-foreground" },
  alerta: { circulo: "bg-brand-amber/10", icone: "text-brand-amber" },
} as const satisfies Record<EmptyStateTone, { circulo: string; icone: string }>;

export function EmptyState({
  icon: Icon,
  titulo,
  descricao,
  tone = "neutro",
  acao,
}: {
  icon: LucideIcon;
  titulo: string;
  descricao: string;
  tone?: EmptyStateTone;
  acao?: ReactNode;
}) {
  const classes = TONE_CLASS[tone];

  return (
    // Densidade espacada como o resto do painel: o vazio ocupa a mesma altura
    // que o conteudo ocuparia, entao a pagina nao encolhe quando um bloco nao
    // tem o que mostrar.
    <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
      <span
        aria-hidden="true"
        className={cn("flex size-14 items-center justify-center rounded-full", classes.circulo)}
      >
        <Icon className={cn("size-6", classes.icone)} />
      </span>
      <div className="flex flex-col gap-1.5">
        <p className="font-medium text-foreground">{titulo}</p>
        {/* Largura de leitura, nao largura do cartao: descricao esticada por uma
            tela larga vira uma linha unica dificil de varrer. */}
        <p className="max-w-prose text-sm text-muted-foreground">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { formatMetric } from "@/lib/format";
import type { MetricUnit } from "@/lib/metrics/catalog";
import { countUpValue, parseCssDuration } from "@/lib/motion/count-up";
import { cn } from "@/lib/utils";

const TOKEN_DURACAO = "--motion-count";
const DURACAO_PADRAO_MS = 600;

function duracaoDaContagem(): number {
  return parseCssDuration(
    getComputedStyle(document.documentElement).getPropertyValue(TOKEN_DURACAO),
    DURACAO_PADRAO_MS,
  );
}

export function MetricValue({
  value,
  unit,
  currency,
  // `display` e `title` chegam prontos do servidor. O quadro final da contagem
  // volta para essa string, e nao para uma formatada aqui: o Intl do navegador e
  // o do Node divergem em detalhe (ver o comentario do compacto em
  // src/lib/format.ts), e reformatar no cliente trocaria o numero por um
  // parecido no fim da animacao.
  display,
  title,
  className,
}: {
  value: number | null;
  unit: MetricUnit;
  currency: string;
  display: string;
  title: string;
  className?: string;
}) {
  const reduzido = useReducedMotion();
  const [parcial, setParcial] = useState<string | null>(null);

  useEffect(() => {
    // Metrica que nao se aplica chega como travessao: nao ha de zero ao que
    // contar, e animar o travessao seria inventar uma medicao.
    if (reduzido || value === null) {
      return;
    }

    const duracao = duracaoDaContagem();
    const inicio = performance.now();
    let quadro = requestAnimationFrame(function passo(agora: number) {
      const decorrido = agora - inicio;
      if (decorrido >= duracao) {
        setParcial(null);
        return;
      }

      setParcial(formatMetric(countUpValue(value, decorrido, duracao), unit, currency).display);
      quadro = requestAnimationFrame(passo);
    });

    return () => {
      cancelAnimationFrame(quadro);
      setParcial(null);
    };
  }, [reduzido, value, unit, currency]);

  return (
    // Figura proporcional, e nao tabular: tabular-nums e para coluna que alinha
    // na vertical, e alarga digito de numero grande e isolado.
    //
    // O `min-w` e um piso, nao o que segura o layout hoje: nos dois lugares onde
    // este componente aparece o valor esta numa coluna de grade de largura fixa,
    // que ja impede empurrao quando o numero encurta ao trocar de periodo
    // ("R$ 12,3 mil" para "R$ 998"). Ele existe para o caso de o valor cair num
    // contexto que se dimensiona pelo conteudo.
    <p
      className={cn("text-metric min-w-[8ch] font-semibold tracking-tight", className)}
      title={title}
    >
      {parcial ?? display}
    </p>
  );
}

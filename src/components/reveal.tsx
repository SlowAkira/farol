"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { MOVIMENTO_REDUZIDO } from "@/lib/motion/count-up";
import { cn } from "@/lib/utils";

// Casca de entrada. Recebe `children` ja renderizado no servidor, entao o
// wrapper e cliente mas a arvore dentro dele continua servidor -- o componente e
// folha no sentido que importa, o de nao arrastar o conteudo para o bundle.
type Estado = "direto" | "pendente" | "visivel";

// A margem negativa segura a revelacao ate o bloco entrar de verdade na tela, e
// nao no instante em que a primeira linha de pixel encosta na borda.
const MARGEM = "0px 0px -8% 0px";

// useLayoutEffect roda depois da hidratacao e antes da pintura; useEffect roda
// depois de pintar. A diferenca aqui e visivel: com useEffect o conteudo aparece,
// some e volta. No servidor o hook nao existe, dai a troca -- sem isso o React
// avisa a cada render de SSR.
const useEfeitoDeLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  const alvo = useRef<HTMLDivElement>(null);
  // "direto" e o estado do HTML do servidor: sem atributo, sem opacidade zero.
  // Sem JS, ou com movimento reduzido, o bloco fica exatamente assim.
  const [estado, setEstado] = useState<Estado>("direto");

  useEfeitoDeLayout(() => {
    if (window.matchMedia(MOVIMENTO_REDUZIDO).matches) {
      return;
    }
    setEstado("pendente");
  }, []);

  useEffect(() => {
    if (estado !== "pendente") {
      return;
    }

    const elemento = alvo.current;
    // Ambiente sem IntersectionObserver revela na hora: a entrada e enfeite e
    // nunca pode ser a condicao para o conteudo existir.
    if (!elemento || typeof IntersectionObserver === "undefined") {
      setEstado("visivel");
      return;
    }

    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          setEstado("visivel");
          observador.disconnect();
        }
      },
      { rootMargin: MARGEM },
    );

    observador.observe(elemento);
    return () => observador.disconnect();
  }, [estado]);

  return (
    <div
      ref={alvo}
      className={cn(className)}
      data-reveal={estado === "direto" ? undefined : estado}
    >
      {children}
    </div>
  );
}

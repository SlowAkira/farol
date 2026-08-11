"use client";

import { useEffect, useState } from "react";
import { MOVIMENTO_REDUZIDO } from "@/lib/motion/count-up";

// Comeca em `true` de proposito. Antes de montar nao ha como saber a preferencia,
// e chutar "pode animar" faria o primeiro quadro esconder conteudo que talvez
// nunca fosse revelado. Errar para "reduzido" custa uma animacao perdida; errar
// para o outro lado custa a tela.
export function useReducedMotion(): boolean {
  const [reduzido, setReduzido] = useState(true);

  useEffect(() => {
    const media = window.matchMedia(MOVIMENTO_REDUZIDO);
    setReduzido(media.matches);

    function aoMudar(evento: MediaQueryListEvent): void {
      setReduzido(evento.matches);
    }

    media.addEventListener("change", aoMudar);
    return () => media.removeEventListener("change", aoMudar);
  }, []);

  return reduzido;
}

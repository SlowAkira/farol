"use client";

import { BellOff, Check } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resolverAlerta, silenciarAlerta } from "../actions";

// As duas acoes do cartao. Leaf client (CLAUDE.md): o cartao inteiro continua
// sendo Server Component, e so a dupla de botoes vem para o navegador.
export function AlertActions({
  alertId,
  readOnlyMessage,
}: {
  alertId: string;
  // Mensagem de somente leitura quando a sessao e a demo, ja resolvida no
  // servidor. Vem pronta em vez de a sessao descer inteira ate aqui.
  readOnlyMessage: string | null;
}) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const bloqueado = readOnlyMessage !== null;

  function executar(acao: () => Promise<{ ok: boolean; message?: string }>): void {
    setErro(null);
    iniciar(async () => {
      const resultado = await acao();
      if (!resultado.ok) {
        setErro(resultado.message ?? "Não foi possível concluir a ação.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={bloqueado || pendente}
          onClick={() => executar(() => silenciarAlerta(alertId))}
        >
          <BellOff aria-hidden="true" />
          Silenciar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={bloqueado || pendente}
          onClick={() => executar(() => resolverAlerta(alertId))}
        >
          <Check aria-hidden="true" />
          Marcar como resolvido
        </Button>
      </div>
      {/* A explicacao fica visivel ao lado dos botoes, e nao escondida num
          tooltip de elemento desabilitado: botao desabilitado nao recebe foco
          nem cursor, entao um tooltip ali nunca apareceria para quem mais
          precisa dele. `role="status"` porque a mensagem de erro chega depois de
          um clique e precisa ser anunciada. */}
      {bloqueado ? (
        <p className="text-label text-muted-foreground">{readOnlyMessage}</p>
      ) : null}
      {erro ? (
        <p role="status" className="text-label text-muted-foreground">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

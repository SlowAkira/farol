"use client";

import { Pause, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toggleRule } from "../actions";

// Pausar em vez de excluir: uma regra pausada guarda a calibragem que deu
// trabalho, e voltar a ligar e um clique. Excluir leva os alertas junto.
export function RuleToggle({
  ruleId,
  ruleName,
  enabled,
  readOnly,
}: {
  ruleId: string;
  ruleName: string;
  enabled: boolean;
  readOnly: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function alternar(): void {
    setErro(null);
    iniciar(async () => {
      const resultado = await toggleRule(ruleId, !enabled);
      if (resultado.ok) {
        router.refresh();
        return;
      }
      setErro(resultado.message);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={readOnly || pendente}
        onClick={alternar}
      >
        {enabled ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        {/* O nome da regra entra no rotulo acessivel: uma lista com seis botoes
            "Pausar" nao diz a leitor de tela qual regra cada um pausa. */}
        <span aria-hidden="true">{enabled ? "Pausar" : "Ativar"}</span>
        <span className="sr-only">
          {enabled ? `Pausar a regra ${ruleName}` : `Ativar a regra ${ruleName}`}
        </span>
      </Button>
      {erro ? (
        <p role="status" className="text-label text-muted-foreground">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

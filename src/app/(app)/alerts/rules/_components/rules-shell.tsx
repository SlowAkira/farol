import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

// Mesmo cabecalho nas tres telas de regra (lista, nova, edicao). A migalha volta
// para os alertas porque regra so existe por causa deles: quem entrou aqui pelo
// feed precisa de um caminho de volta que nao seja o botao do navegador.
export function RulesShell({
  titulo,
  subtitulo,
  voltarPara,
  acao,
  children,
}: {
  titulo: string;
  subtitulo?: string;
  voltarPara: string;
  acao?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={voltarPara}
            className="transition-interactive text-label text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            ← Alertas
          </Link>
          <h1 className="text-section font-semibold">{titulo}</h1>
          {subtitulo ? <p className="text-muted-foreground">{subtitulo}</p> : null}
        </div>
        {acao}
      </header>
      {children}
    </div>
  );
}

export function EmptyCard({ children }: { children: ReactNode }) {
  return (
    <Card>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { Component, startTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";

// Um erro de render (ou um Server Component que lanca durante o streaming) sobe
// ate a fronteira mais proxima. Sem uma por bloco, a fronteira mais proxima e a
// da rota inteira: uma consulta de campanha que falha levaria junto os KPIs e o
// grafico, que estavam prontos e corretos.
function BlockErrorCard({ titulo, onReset }: { titulo: string; onReset: () => void }) {
  const router = useRouter();

  // Recarregar e limpar o erro tem que acontecer na mesma transicao. Limpar
  // antes remonta o bloco em cima do payload que ja falhou e ele estoura de
  // novo na hora; limpar depois deixa o cartao de erro por cima de um bloco que
  // ja voltou saudavel.
  function tentarDeNovo(): void {
    startTransition(() => {
      router.refresh();
      onReset();
    });
  }

  return (
    <Card>
      <CardContent>
        <EmptyState
          icon={TriangleAlert}
          tone="alerta"
          titulo={titulo}
          descricao="Os outros blocos do painel continuam válidos. Tentar de novo recarrega só os dados desta seção."
          acao={
            <Button type="button" variant="outline" size="sm" onClick={tentarDeNovo}>
              <RotateCw aria-hidden="true" />
              Tentar de novo
            </Button>
          }
        />
      </CardContent>
    </Card>
  );
}

type Props = { readonly titulo: string; readonly children: ReactNode };
type State = { readonly falhou: boolean };

export class BlockBoundary extends Component<Props, State> {
  state: State = { falhou: false };

  static getDerivedStateFromError(): State {
    return { falhou: true };
  }

  componentDidCatch(error: unknown): void {
    // O log do servidor ja registra o erro original; aqui e o unico ponto onde
    // ele aparece quando a falha acontece no cliente.
    console.error("Bloco do painel falhou:", error);
  }

  render(): ReactNode {
    if (!this.state.falhou) {
      return this.props.children;
    }

    return (
      <BlockErrorCard
        titulo={this.props.titulo}
        onReset={() => this.setState({ falhou: false })}
      />
    );
  }
}

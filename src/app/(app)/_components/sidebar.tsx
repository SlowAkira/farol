"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campaigns", label: "Campanhas" },
  { href: "/alerts", label: "Alertas" },
] as const;

const REPOSITORIO = "https://github.com/SlowAkira/farol";

// O lucide v1 removeu os icones de marca, entao nao existe mais um `Github`
// para importar. Seta de link externo mais a palavra diz a mesma coisa sem
// carregar um SVG de marca copiado para dentro do repo.
function RodapeDaSidebar({ email, isDemo }: { email: string | null; isDemo: boolean }) {
  return (
    // `mt-auto` e o que prende o rodape na base da coluna; escondido abaixo do
    // `md` porque ali a sidebar e uma faixa horizontal de tres itens, sem base
    // onde prender. No celular o e-mail e o selo nao aparecem mesmo -- e
    // informacao de contexto, nao acao, e a unica acao de sessao (sair) ja mora
    // na topbar, que existe em toda largura.
    <div className="mt-auto hidden flex-col gap-2 border-t border-sidebar-border pt-4 md:flex">
      <div className="flex min-w-0 flex-col gap-1.5">
        {email ? (
          // `truncate` com `title`: 14rem de coluna nao cabem um e-mail
          // corporativo inteiro, e cortar sem deixar o valor completo em algum
          // lugar transformaria o rodape em enigma.
          <span className="truncate text-label text-muted-foreground" title={email}>
            {email}
          </span>
        ) : null}
        {isDemo ? (
          // Selo neutro, nao de alerta: modo demo e um fato sobre a sessao, nao
          // um problema. Ambar e vermelho continuam reservados a alerta.
          <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-label text-muted-foreground">
            modo demo
          </span>
        ) : null}
      </div>
      <a
        href={REPOSITORIO}
        target="_blank"
        rel="noreferrer"
        className="transition-interactive flex items-center gap-1.5 text-label text-muted-foreground hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ExternalLink className="size-3 shrink-0" aria-hidden="true" />
        Repositório no GitHub
      </a>
    </div>
  );
}

// usePathname exige client, e por isso a sidebar inteira e um leaf client em
// vez de so o destaque da rota ativa: nao ha como isolar so o `usePathname`
// num componente menor sem duplicar a lista de nav em dois lugares.
export function Sidebar({ email, isDemo }: { email: string | null; isDemo: boolean }) {
  const pathname = usePathname();

  return (
    // Abaixo do `md` a logo e os links dividem uma faixa horizontal, para nao
    // gastar altura de tela num celular; do `md` para cima e a coluna de sempre.
    <aside className="flex items-center gap-4 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:h-screen md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0">
      {/* Logo em cor de texto, nao em cor de marca nem de acento: o violeta e
          reservado ao que responde a cursor e teclado, e o ambar virou cor de
          alerta. O logo nao e nenhum dos dois. */}
      <span className="text-lead font-semibold md:mb-8">Farol</span>
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:flex-none md:flex-col md:overflow-visible">
        {NAV_ITEMS.map((item) => {
          // Rota filha mantem o pai aceso: /alerts/rules e /campaigns/<id> sao a
          // mesma secao, e apagar o item ali faria a navegacao dizer que a pessoa
          // saiu do painel.
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "transition-interactive rounded-md px-3 py-2 text-body hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                // brand-link, e nao primary: o roxo cheio da marca sobre o
                // `bg-primary/10` do tema escuro dava 2,9:1, abaixo de AA. O
                // token de link ja e o roxo calibrado para texto em cada tema.
                isActive ? "bg-primary/10 font-medium text-brand-link" : "text-sidebar-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <RodapeDaSidebar email={email} isDemo={isDemo} />
    </aside>
  );
}

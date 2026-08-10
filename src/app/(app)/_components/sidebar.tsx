"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/campaigns", label: "Campanhas" },
  { href: "/alerts", label: "Alertas" },
] as const;

// usePathname exige client, e por isso a sidebar inteira e um leaf client em
// vez de so o destaque da rota ativa: nao ha como isolar so o `usePathname`
// num componente menor sem duplicar a lista de nav em dois lugares.
export function Sidebar() {
  const pathname = usePathname();

  return (
    // Abaixo do `md` a logo e os links dividem uma faixa horizontal, para nao
    // gastar altura de tela num celular; do `md` para cima e a coluna de sempre.
    <aside className="flex items-center gap-4 border-b border-sidebar-border bg-sidebar p-4 text-sidebar-foreground md:h-screen md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0">
      <span className="text-lg font-semibold text-brand-amber md:mb-8">Farol</span>
      <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto md:flex-none md:flex-col md:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
    </aside>
  );
}

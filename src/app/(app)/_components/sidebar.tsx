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
    <aside className="flex h-screen flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <span className="mb-8 text-lg font-semibold text-brand-amber">Farol</span>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive ? "bg-primary/10 font-medium text-primary" : "text-sidebar-foreground",
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

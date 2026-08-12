"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatPeriod } from "@/lib/format";
import {
  PERIOD_PRESET_DAYS,
  periodAnchor,
  periodForPreset,
  resolveAccountId,
  resolvePeriod,
  withParams,
  type PeriodPresetDays,
} from "../_lib/search-params";
import type { AccountOption } from "./account-selector";

// Ponte para o Calendar (react-day-picker, API em Date) na borda do
// componente; o resto do projeto continua trabalhando com string YYYY-MM-DD.
function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Alerta nao tem periodo: o feed mostra o que disparou, cada cartao carrega a
// janela da propria regra, e o preview de backtest e sempre 90 dias. Um seletor
// que nao muda nada do que esta na tela e pior que nenhum -- quem clica conclui
// que a tela esta quebrada, e nao que o controle nao se aplica ali.
const ROTAS_SEM_PERIODO = ["/alerts"];

export function DateRangePicker({ accounts }: { accounts: readonly AccountOption[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (ROTAS_SEM_PERIODO.some((rota) => pathname === rota || pathname.startsWith(`${rota}/`))) {
    return null;
  }

  // Resolve a conta pelo mesmo caminho que a pagina do servidor resolve, e a
  // partir da mesma lista na mesma ordem: os presets tem que terminar onde o
  // periodo que o servidor montou termina, senao nenhum aparece ativo.
  const selectedId = resolveAccountId(searchParams, accounts);
  const selected = accounts.find((account) => account.id === selectedId);
  const anchor = periodAnchor(selected?.ultimoDiaComDado ?? null);
  const period = resolvePeriod(searchParams, anchor);

  function navigate(next: { since: string; until: string }): void {
    router.push(`?${withParams(searchParams, next)}`);
  }

  const activePresetDays = PERIOD_PRESET_DAYS.find((days: PeriodPresetDays) => {
    const preset = periodForPreset(days, anchor);
    return preset.since === period.since && preset.until === period.until;
  });

  return (
    // Envolve em vez de estourar: em 375px os presets cabem numa linha e o botao
    // de periodo personalizado, que carrega duas datas por extenso, desce para a
    // seguinte.
    <div className="flex flex-wrap items-center gap-1">
      {PERIOD_PRESET_DAYS.map((days) => (
        <Button
          key={days}
          type="button"
          variant={activePresetDays === days ? "default" : "outline"}
          size="sm"
          onClick={() => navigate(periodForPreset(days, anchor))}
        >
          {days}d
        </Button>
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant={activePresetDays === undefined ? "default" : "outline"}
            size="sm"
          >
            {activePresetDays === undefined
              ? formatPeriod(period.since, period.until)
              : "Personalizado"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="range"
            defaultMonth={toDate(period.since)}
            selected={{ from: toDate(period.since), to: toDate(period.until) }}
            onSelect={(range) => {
              if (range?.from && range?.to) {
                navigate({ since: toIsoDate(range.from), until: toIsoDate(range.to) });
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

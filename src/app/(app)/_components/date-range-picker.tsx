"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  PERIOD_PRESET_DAYS,
  periodForPreset,
  resolvePeriod,
  withParams,
  type PeriodPresetDays,
} from "../_lib/search-params";

// Ponte para o Calendar (react-day-picker, API em Date) na borda do
// componente; o resto do projeto continua trabalhando com string YYYY-MM-DD.
function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const period = resolvePeriod(searchParams);
  const [open, setOpen] = useState(false);

  function navigate(next: { since: string; until: string }): void {
    router.push(`?${withParams(searchParams, next)}`);
  }

  const activePresetDays = PERIOD_PRESET_DAYS.find((days: PeriodPresetDays) => {
    const preset = periodForPreset(days);
    return preset.since === period.since && preset.until === period.until;
  });

  return (
    <div className="flex items-center gap-1">
      {PERIOD_PRESET_DAYS.map((days) => (
        <Button
          key={days}
          type="button"
          variant={activePresetDays === days ? "default" : "outline"}
          size="sm"
          onClick={() => navigate(periodForPreset(days))}
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
              ? `${period.since} a ${period.until}`
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

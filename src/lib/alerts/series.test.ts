import { describe, expect, it } from "vitest";
import { AlertMetric } from "@/generated/prisma/enums";
import {
  hasDataBetween,
  mergeSeries,
  metricByDay,
  sliceByDate,
  totalsBetween,
  type DayTotals,
} from "./series";

function dia(date: string, overrides: Partial<DayTotals> = {}): DayTotals {
  return {
    date,
    hasData: true,
    impressions: 1_000,
    clicks: 20,
    spendCents: 10_000,
    conversions: 10,
    conversionValueCents: 40_000,
    reach: 800,
    ...overrides,
  };
}

const VAZIO: Partial<DayTotals> = {
  hasData: false,
  impressions: 0,
  clicks: 0,
  spendCents: 0,
  conversions: 0,
  conversionValueCents: 0,
  reach: 0,
};

const SERIE = [dia("2026-08-01"), dia("2026-08-02"), dia("2026-08-03"), dia("2026-08-04")];

describe("sliceByDate", () => {
  it("recorta pelo intervalo, com as duas pontas incluidas", () => {
    expect(sliceByDate(SERIE, "2026-08-02", "2026-08-03").map((day) => day.date)).toEqual([
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("devolve vazio quando o intervalo nao alcanca a serie", () => {
    expect(sliceByDate(SERIE, "2026-09-01", "2026-09-30")).toEqual([]);
  });
});

describe("totalsBetween", () => {
  it("soma os totais dos dias do intervalo", () => {
    expect(totalsBetween(SERIE, "2026-08-01", "2026-08-02")).toEqual({
      impressions: 2_000,
      clicks: 40,
      spendCents: 20_000,
      conversions: 20,
      conversionValueCents: 80_000,
      reach: 1_600,
    });
  });

  it("soma zero em intervalo sem dia nenhum", () => {
    expect(totalsBetween(SERIE, "2026-09-01", "2026-09-02").spendCents).toBe(0);
  });
});

describe("hasDataBetween", () => {
  it("enxerga entrega em qualquer dia do intervalo", () => {
    const serie = [dia("2026-08-01", VAZIO), dia("2026-08-02"), dia("2026-08-03", VAZIO)];
    expect(hasDataBetween(serie, "2026-08-01", "2026-08-03")).toBe(true);
  });

  // Zero medido e ausencia de medicao chegam com os mesmos totais; so hasData
  // distingue, e e essa distincao que impede "parou de rodar" virar "despencou".
  it("distingue janela sem ingestao de janela zerada", () => {
    const semIngestao = [dia("2026-08-01", VAZIO), dia("2026-08-02", VAZIO)];
    const rodouGastandoZero = semIngestao.map((day) => ({ ...day, hasData: true }));

    expect(hasDataBetween(semIngestao, "2026-08-01", "2026-08-02")).toBe(false);
    expect(hasDataBetween(rodouGastandoZero, "2026-08-01", "2026-08-02")).toBe(true);
  });
});

describe("mergeSeries", () => {
  it("soma as campanhas dia a dia, alinhando por data", () => {
    const merged = mergeSeries([
      [dia("2026-08-01"), dia("2026-08-02")],
      [dia("2026-08-01"), dia("2026-08-02")],
    ]);

    expect(merged.map((day) => day.spendCents)).toEqual([20_000, 20_000]);
  });

  it("devolve os dias em ordem de calendario", () => {
    const merged = mergeSeries([[dia("2026-08-03")], [dia("2026-08-01")], [dia("2026-08-02")]]);
    expect(merged.map((day) => day.date)).toEqual(["2026-08-01", "2026-08-02", "2026-08-03"]);
  });

  // Um dia medido em qualquer campanha e um dia medido na conta: exigir todas
  // apagaria da serie o dia em que uma campanha estava pausada.
  it("marca o dia como medido se ao menos uma campanha mediu", () => {
    const merged = mergeSeries([[dia("2026-08-01", VAZIO)], [dia("2026-08-01")]]);
    expect(merged[0].hasData).toBe(true);
  });

  it("devolve vazio sem serie nenhuma", () => {
    expect(mergeSeries([])).toEqual([]);
  });
});

describe("metricByDay", () => {
  it("calcula a metrica do alerta em cada dia", () => {
    // CPA = 10.000 centavos / 10 conversoes.
    expect(metricByDay([dia("2026-08-01")], AlertMetric.CPA)).toEqual([1_000]);
  });

  it("le metrica de total sem dividir nada", () => {
    expect(metricByDay([dia("2026-08-01")], AlertMetric.SPEND)).toEqual([10_000]);
  });

  // Dia sem ingestao vira null, e nao zero: a sparkline interrompe o traco ali em
  // vez de desenhar uma queda a pique que ninguem mediu.
  it("devolve null no dia sem ingestao", () => {
    expect(metricByDay([dia("2026-08-01", VAZIO)], AlertMetric.CPA)).toEqual([null]);
  });

  // Dia medido em que a derivada nao existe (sem conversao) tambem e null, pelo
  // motivo de sempre: nao ha denominador.
  it("devolve null no dia medido sem denominador", () => {
    expect(metricByDay([dia("2026-08-01", { conversions: 0 })], AlertMetric.CPA)).toEqual([null]);
  });
});

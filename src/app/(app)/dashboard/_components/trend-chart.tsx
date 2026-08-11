"use client";

import { useId, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { formatMetric } from "@/lib/format";
import {
  DASHBOARD_METRICS,
  metricDefinition,
  type DashboardMetricKey,
  type MetricDefinition,
} from "@/lib/metrics/catalog";

export type TrendRow = { readonly date: string; readonly label: string } & {
  readonly [K in DashboardMetricKey]: number | null;
} & {
  // Por que cada metrica nao se aplica naquele dia, quando nao se aplica. Vem
  // pronto do servidor: os totais do dia ficam la, e este componente e cliente
  // -- ele nao divide numero nem deduz o que faltou, so mostra a frase.
  readonly motivos: { readonly [K in DashboardMetricKey]?: string };
};

const AXIS_TICK = { fill: "var(--color-muted-foreground)", fontSize: 12 } as const;
const PANEL_HEIGHT = 200;
const CHART_MARGIN = { top: 8, right: 8, bottom: 0, left: 0 } as const;

function TooltipRow({
  definition,
  value,
  motivo,
  currency,
  mark,
}: {
  definition: MetricDefinition;
  value: number | null;
  motivo: string | undefined;
  currency: string;
  mark: "bar" | "line";
}) {
  const formatted = formatMetric(value, definition.unit, currency, motivo);

  return (
    <div className="flex items-baseline justify-between gap-6">
      <span className="flex items-center gap-2 text-muted-foreground">
        {/* Chave curta na cor da serie, nao caixa preenchida: no tamanho do
            tooltip a caixa vira tinta com peso de dado fazendo trabalho de
            rotulo. O texto fica em cor de texto, nunca na cor da serie. */}
        <span
          aria-hidden="true"
          className="inline-block h-0.5 w-3 rounded-full"
          style={{
            backgroundColor: mark === "bar" ? "var(--color-chart-1)" : "var(--color-chart-2)",
          }}
        />
        {definition.label}
      </span>
      {/* Valor primeiro na hierarquia: quem chegou aqui ja sabe qual serie e, e
          quer o numero. */}
      <span className="font-semibold tabular-nums" title={formatted.title}>
        {formatted.display}
      </span>
    </div>
  );
}

function renderTooltip(
  { active, payload }: TooltipContentProps,
  barDefinition: MetricDefinition,
  lineDefinition: MetricDefinition,
  currency: string,
) {
  const row = active ? (payload?.[0]?.payload as TrendRow | undefined) : undefined;
  if (!row) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{row.label}</p>
      <div className="flex flex-col gap-1">
        <TooltipRow
          definition={barDefinition}
          value={row[barDefinition.key as DashboardMetricKey]}
          motivo={row.motivos[barDefinition.key as DashboardMetricKey]}
          currency={currency}
          mark="bar"
        />
        <TooltipRow
          definition={lineDefinition}
          value={row[lineDefinition.key as DashboardMetricKey]}
          motivo={row.motivos[lineDefinition.key as DashboardMetricKey]}
          currency={currency}
          mark="line"
        />
      </div>
    </div>
  );
}

function MetricSelect({
  id,
  legend,
  value,
  onChange,
}: {
  id: string;
  legend: string;
  value: DashboardMetricKey;
  onChange: (next: DashboardMetricKey) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground" htmlFor={id}>
        {legend}
      </label>
      <Select value={value} onValueChange={(next) => onChange(next as DashboardMetricKey)}>
        <SelectTrigger id={id} size="sm" className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DASHBOARD_METRICS.map((definition) => (
            <SelectItem key={definition.key} value={definition.key}>
              {definition.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function PanelHeading({
  definition,
  mark,
}: {
  definition: MetricDefinition;
  mark: "bar" | "line";
}) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
      <span
        aria-hidden="true"
        className={mark === "bar" ? "inline-block h-3 w-2 rounded-sm" : "inline-block h-0.5 w-4 rounded-full"}
        style={{
          backgroundColor: mark === "bar" ? "var(--color-chart-1)" : "var(--color-chart-2)",
        }}
      />
      {definition.label}
    </h3>
  );
}

function TrendTable({
  rows,
  barDefinition,
  lineDefinition,
  currency,
}: {
  rows: readonly TrendRow[];
  barDefinition: MetricDefinition;
  lineDefinition: MetricDefinition;
  currency: string;
}) {
  return (
    <div className="max-h-[26rem] overflow-y-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Valores diários de {barDefinition.label} e {lineDefinition.label} no período
        </caption>
        <thead className="sticky top-0 bg-card">
          <tr className="border-b border-border text-left text-muted-foreground">
            <th scope="col" className="py-2 font-medium">
              Dia
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {barDefinition.label}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {lineDefinition.label}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const barValue = formatMetric(
              row[barDefinition.key as DashboardMetricKey],
              barDefinition.unit,
              currency,
              row.motivos[barDefinition.key as DashboardMetricKey],
            );
            const lineValue = formatMetric(
              row[lineDefinition.key as DashboardMetricKey],
              lineDefinition.unit,
              currency,
              row.motivos[lineDefinition.key as DashboardMetricKey],
            );

            return (
              <tr key={row.date} className="border-b border-border/60 last:border-0">
                <th scope="row" className="py-2 font-normal text-muted-foreground">
                  {row.label}
                </th>
                <td className="py-2 text-right tabular-nums" title={barValue.title}>
                  {barValue.display}
                </td>
                <td className="py-2 text-right tabular-nums" title={lineValue.title}>
                  {lineValue.display}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TrendChart({
  rows,
  currency,
  coverageLabel,
}: {
  rows: readonly TrendRow[];
  currency: string;
  coverageLabel: string;
}) {
  const [barKey, setBarKey] = useState<DashboardMetricKey>("spendCents");
  const [lineKey, setLineKey] = useState<DashboardMetricKey>("roasRatio");
  const [showTable, setShowTable] = useState(false);
  const idPrefix = useId();
  const syncId = `${idPrefix}-tendencia`;

  const barDefinition = metricDefinition(barKey);
  const lineDefinition = metricDefinition(lineKey);

  const tooltipContent = (props: TooltipContentProps) =>
    renderTooltip(props, barDefinition, lineDefinition, currency);

  const axisTickFormatter = (definition: MetricDefinition) => (value: number) =>
    formatMetric(value, definition.unit, currency).display;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <MetricSelect
            id={`${idPrefix}-barras`}
            legend="Barras"
            value={barKey}
            onChange={setBarKey}
          />
          <MetricSelect
            id={`${idPrefix}-linha`}
            legend="Linha"
            value={lineKey}
            onChange={setLineKey}
          />
        </div>
        {/* O tooltip nunca e o unico caminho para o valor: a tabela mostra os
            mesmos numeros sem depender de hover nem de enxergar cor. */}
        <Button type="button" variant="outline" size="sm" onClick={() => setShowTable((on) => !on)}>
          {showTable ? "Ver gráfico" : "Ver tabela"}
        </Button>
      </div>

      {showTable ? (
        <TrendTable
          rows={rows}
          barDefinition={barDefinition}
          lineDefinition={lineDefinition}
          currency={currency}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <PanelHeading definition={barDefinition} mark="bar" />
            <ResponsiveContainer width="100%" height={PANEL_HEIGHT}>
              {/* accessibilityLayer: o grafico entra na ordem de tabulacao e as
                  setas andam pelos dias, mostrando o mesmo tooltip do mouse. */}
              <BarChart data={[...rows]} syncId={syncId} margin={CHART_MARGIN} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                {/* Eixo X sem rotulo aqui: os dois paineis compartilham a mesma
                    escala de dias e quem nomeia e o painel de baixo. */}
                <XAxis
                  dataKey="label"
                  tick={false}
                  tickLine={false}
                  height={1}
                  axisLine={{ stroke: "var(--color-chart-axis)" }}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={axisTickFormatter(barDefinition)}
                />
                <Tooltip content={tooltipContent} cursor={{ fill: "var(--color-muted)" }} />
                <Bar
                  dataKey={barKey}
                  fill="var(--color-chart-1)"
                  maxBarSize={24}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col gap-2">
            <PanelHeading definition={lineDefinition} mark="line" />
            <ResponsiveContainer width="100%" height={PANEL_HEIGHT}>
              {/* Sem accessibilityLayer aqui de proposito: ele poe o grafico na
                  ordem de tabulacao, e este painel nao tem leitura propria -- quem
                  chegasse nele pelo teclado moveria um cursor sem ver valor
                  nenhum. A leitura das duas metricas esta no painel de cima, que
                  e o unico focavel; o syncId move o cursor daqui junto. */}
              <LineChart data={[...rows]} syncId={syncId} margin={CHART_MARGIN}>
                <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  tickLine={false}
                  minTickGap={24}
                  axisLine={{ stroke: "var(--color-chart-axis)" }}
                />
                <YAxis
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                  tickFormatter={axisTickFormatter(lineDefinition)}
                />
                {/* Um unico tooltip para as duas series, ancorado no painel de
                    cima: com syncId o cursor dos dois paineis anda junto, entao
                    uma caixa por painel seria a mesma leitura duas vezes. */}
                <Tooltip
                  content={() => null}
                  wrapperStyle={{ display: "none" }}
                  cursor={{ stroke: "var(--color-chart-axis)" }}
                />
                <Line
                  dataKey={lineKey}
                  type="monotone"
                  stroke="var(--color-chart-2)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  // Anel na cor do card no ponto ativo, e sem ligar buracos: dia
                  // sem denominador (ROAS de gasto zero) interrompe a linha em vez
                  // de virar uma reta que ninguem mediu.
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-card)" }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* A serie termina no ultimo dia medido, nao no fim do periodo escolhido.
          Sem esta linha o corte pareceria periodo curto; com ela fica explicito
          que o que falta e ingestao, e nao resultado zerado. */}
      <p className="text-sm text-muted-foreground">{coverageLabel}</p>
    </div>
  );
}

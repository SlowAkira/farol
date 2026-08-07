import { sparklineGeometry } from "@/lib/charts/sparkline";

const WIDTH = 96;
const HEIGHT = 28;
const PADDING = 3;

// SVG estatico montado no servidor: a sparkline nao tem hover nem tooltip, entao
// nao ha motivo para arrastar Recharts (e um bundle client) ate o cartao de KPI.
// A geometria vem de src/lib/charts, porque componente nao divide numero.
export function Sparkline({
  values,
  label,
}: {
  values: readonly (number | null)[];
  label: string;
}) {
  const geometry = sparklineGeometry(values, {
    width: WIDTH,
    height: HEIGHT,
    padding: PADDING,
  });

  if (!geometry) {
    // Mantem a altura do bloco: sem isso o cartao sem historico encolhe e a
    // linha de KPIs fica desalinhada.
    return <div className="h-7 w-24" aria-hidden="true" />;
  }

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      width={WIDTH}
      height={HEIGHT}
      className="h-7 w-24 text-muted-foreground"
      role="img"
      aria-label={label}
      focusable="false"
    >
      {geometry.paths.map((path) => (
        <path
          key={path}
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {geometry.lastPoint ? (
        // Anel na cor do card, nao borda: separa o ponto do traco onde os dois se
        // encostam sem acrescentar tinta que nao e dado.
        <circle
          cx={geometry.lastPoint.x}
          cy={geometry.lastPoint.y}
          r={2.5}
          fill="currentColor"
          stroke="var(--color-card)"
          strokeWidth={1.5}
        />
      ) : null}
    </svg>
  );
}

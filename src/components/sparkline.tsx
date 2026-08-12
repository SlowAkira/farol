import { sparklineGeometry } from "@/lib/charts/sparkline";
import { cn } from "@/lib/utils";

const LARGURA_PADRAO = 96;
const ALTURA_PADRAO = 28;
const PADDING = 3;

// SVG estatico montado no servidor: a sparkline nao tem hover nem tooltip, entao
// nao ha motivo para arrastar Recharts (e um bundle client) ate o cartao. A
// geometria vem de src/lib/charts, porque componente nao divide numero.
//
// A cor sai de `currentColor`: no cartao de KPI o traco e cinza, porque ali ele
// e contexto do numero ao lado; no cartao de alerta ele e a cor da serie, porque
// ali o traco e o dado. Quem posiciona escolhe, passando `className`.
//
// O tamanho vem em pixel do viewBox, e nao de classe utilitaria, para o desenho
// nunca esticar: sparkline distorcida muda a inclinacao da linha, que e a unica
// coisa que ela tem para dizer.
export function Sparkline({
  values,
  label,
  width = LARGURA_PADRAO,
  height = ALTURA_PADRAO,
  className,
}: {
  values: readonly (number | null)[];
  label: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const geometry = sparklineGeometry(values, { width, height, padding: PADDING });

  if (!geometry) {
    // Mantem a altura do bloco: sem isso o cartao sem historico encolhe e a
    // linha de KPIs fica desalinhada.
    return <div style={{ width, height }} aria-hidden="true" />;
  }

  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      width={width}
      height={height}
      className={cn("text-muted-foreground", className)}
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

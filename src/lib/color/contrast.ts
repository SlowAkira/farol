import { linearize, type Rgb } from "./space";

// Pisos da WCAG 2.2. "Texto grande" e 18pt (24px) normal ou 14pt (18.66px)
// negrito; abaixo disso vale AA_TEXT, mesmo que a fonte pareca grande na tela.
export const AA_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;
// 1.4.11: limite de componente de interface e objeto grafico que carrega
// informacao -- serie de grafico, icone, borda de campo.
export const AA_NON_TEXT = 3;

export function relativeLuminance(rgb: Rgb): number {
  const { r, g, b } = linearize(rgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// Composicao de cor translucida sobre um fundo opaco. Necessaria porque a UI usa
// `bg-primary/10` para marcar o item ativo da navegacao: o contraste real do
// texto e contra a mistura, nao contra o fundo puro nem contra a cor da marca.
export function composite(foreground: Rgb, alpha: number, background: Rgb): Rgb {
  return {
    r: foreground.r * alpha + background.r * (1 - alpha),
    g: foreground.g * alpha + background.g * (1 - alpha),
    b: foreground.b * alpha + background.b * (1 - alpha),
  };
}

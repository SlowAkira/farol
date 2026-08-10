import { encodeGamma, linearize, type LinearRgb, type Rgb } from "./space";

export type DichromacyKind = "protanopia" | "deuteranopia";

type Matrix3 = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

// RGB linear -> LMS (Vienot, Brettel & Mollon 1999). E o modelo padrao para
// simular dicromacia: projeta a cor no plano que o cone ausente nao consegue
// separar.
const RGB_TO_LMS: Matrix3 = [
  [17.8824, 43.5161, 4.11935],
  [3.45565, 27.1554, 3.86714],
  [0.0299566, 0.184309, 1.46709],
];

function invert(m: Matrix3): Matrix3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);

  // A matriz e uma constante conhecida e inversivel; se isso mudar, e erro de
  // programacao e nao entrada invalida, entao lanca em vez de virar retorno.
  if (determinant === 0) {
    throw new Error("Matriz RGB->LMS nao e inversivel.");
  }

  return [
    [(e * i - f * h) / determinant, (c * h - b * i) / determinant, (b * f - c * e) / determinant],
    [(f * g - d * i) / determinant, (a * i - c * g) / determinant, (c * d - a * f) / determinant],
    [(d * h - e * g) / determinant, (b * g - a * h) / determinant, (a * e - b * d) / determinant],
  ];
}

// Invertida em codigo, e nao transcrita de uma tabela: constante copiada errada
// e um bug que passa despercebido porque o resultado continua "parecendo cor".
const LMS_TO_RGB = invert(RGB_TO_LMS);

function apply(m: Matrix3, { r, g, b }: LinearRgb): LinearRgb {
  return {
    r: m[0][0] * r + m[0][1] * g + m[0][2] * b,
    g: m[1][0] * r + m[1][1] * g + m[1][2] * b,
    b: m[2][0] * r + m[2][1] * g + m[2][2] * b,
  };
}

// Simula como a cor chega a quem nao tem o cone L (protanopia) ou M
// (deuteranopia). O canal ausente e reconstruido a partir dos outros dois, que e
// exatamente o que colapsa vermelho e verde na mesma aparencia.
export function simulateDichromacy(rgb: Rgb, kind: DichromacyKind): Rgb {
  const lms = apply(RGB_TO_LMS, linearize(rgb));

  const projected: LinearRgb =
    kind === "protanopia"
      ? { r: 2.02344 * lms.g - 2.52581 * lms.b, g: lms.g, b: lms.b }
      : { r: lms.r, g: 0.494207 * lms.r + 1.24827 * lms.b, b: lms.b };

  return encodeGamma(apply(LMS_TO_RGB, projected));
}

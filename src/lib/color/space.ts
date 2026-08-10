// Conversoes de espaco de cor usadas para auditar a paleta. Vive em src/lib
// porque e matematica pura: nenhum componente calcula cor, do mesmo jeito que
// nenhum componente divide numero.

export type Rgb = {
  // Canais sRGB com gama, 0..1.
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type LinearRgb = {
  readonly r: number;
  readonly g: number;
  readonly b: number;
};

export type Lab = {
  readonly l: number;
  readonly a: number;
  readonly b: number;
};

export type ParsedColor = {
  readonly rgb: Rgb;
  readonly alpha: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function toGamma(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055;
}

export function linearize({ r, g, b }: Rgb): LinearRgb {
  return { r: toLinear(r), g: toLinear(g), b: toLinear(b) };
}

// Recorta no gamut sRGB: uma cor simulada para dicromacia pode cair fora dele, e
// o que importa depois e a distancia entre duas cores exibiveis, nao o valor
// teorico fora da tela.
export function encodeGamma({ r, g, b }: LinearRgb): Rgb {
  return { r: clamp01(toGamma(r)), g: clamp01(toGamma(g)), b: clamp01(toGamma(b)) };
}

function parseHex(input: string): ParsedColor | null {
  const digits = input.slice(1);
  const expand = digits.length === 3 || digits.length === 4;
  const size = expand ? 1 : 2;
  if (digits.length !== 3 && digits.length !== 4 && digits.length !== 6 && digits.length !== 8) {
    return null;
  }

  const channels: number[] = [];
  for (let index = 0; index < digits.length; index += size) {
    const chunk = digits.slice(index, index + size);
    const byte = Number.parseInt(expand ? chunk + chunk : chunk, 16);
    if (Number.isNaN(byte)) {
      return null;
    }
    channels.push(byte / 255);
  }

  const [r, g, b, alpha = 1] = channels as [number, number, number, number?];
  return { rgb: { r, g, b }, alpha };
}

// OKLab -> sRGB linear (Bjorn Ottosson). A matriz e a inversa da usada para ir a
// OKLab; os coeficientes sao os publicados, nao arredondados por conta propria.
function oklabToLinear(l: number, a: number, b: number): LinearRgb {
  const lCube = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mCube = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sCube = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return {
    r: 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube,
    g: -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube,
    b: -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube,
  };
}

function parseOklch(input: string): ParsedColor | null {
  const body = input.slice(input.indexOf("(") + 1, input.lastIndexOf(")"));
  const [coords, alphaPart] = body.split("/");
  const parts = coords.trim().split(/\s+/);
  if (parts.length !== 3) {
    return null;
  }

  const numbers = parts.map((part) =>
    part.endsWith("%") ? Number.parseFloat(part) / 100 : Number.parseFloat(part),
  );
  if (numbers.some(Number.isNaN)) {
    return null;
  }

  const [lightness, chroma, hueDegrees] = numbers as [number, number, number];
  const hue = (hueDegrees * Math.PI) / 180;
  const linear = oklabToLinear(lightness, chroma * Math.cos(hue), chroma * Math.sin(hue));

  const alphaText = alphaPart?.trim();
  const alpha =
    alphaText === undefined
      ? 1
      : alphaText.endsWith("%")
        ? Number.parseFloat(alphaText) / 100
        : Number.parseFloat(alphaText);
  if (Number.isNaN(alpha)) {
    return null;
  }

  return { rgb: encodeGamma(linear), alpha };
}

// Cor que o parser nao entende e retorno nulo, nao excecao: quem chama decide se
// isso e um token faltando ou uma sintaxe que ainda nao precisamos suportar.
export function parseColor(input: string): ParsedColor | null {
  const value = input.trim();
  if (value.startsWith("#")) {
    return parseHex(value);
  }
  if (value.startsWith("oklch(")) {
    return parseOklch(value);
  }
  return null;
}

const D65 = { x: 0.95047, y: 1, z: 1.08883 } as const;

function labComponent(value: number): number {
  return value > 216 / 24389 ? Math.cbrt(value) : (841 / 108) * value + 4 / 29;
}

// CIELab a partir do sRGB, com branco D65. Serve so para medir distancia entre
// duas cores; nada no app renderiza a partir de Lab.
export function toLab(rgb: Rgb): Lab {
  const { r, g, b } = linearize(rgb);

  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;

  const fx = labComponent(x / D65.x);
  const fy = labComponent(y / D65.y);
  const fz = labComponent(z / D65.z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// Distancia euclidiana em Lab (CIE76). Grosseira perto do azul, mas o que ela
// precisa responder aqui e "essas duas series se separam?", com folga larga, e
// nao "qual e a diferenca exata percebida".
export function deltaE(first: Rgb, second: Rgb): number {
  const a = toLab(first);
  const b = toLab(second);
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

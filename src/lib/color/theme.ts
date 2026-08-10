import { parseColor, type Rgb } from "./space";

export type ThemeName = "claro" | "escuro";

export type ThemeTokens = {
  readonly [name in ThemeName]: ReadonlyMap<string, string>;
};

// O tema claro mora em `:root` e o escuro em `.dark` (o `@custom-variant dark` de
// globals.css). Ler o proprio CSS, em vez de espelhar os valores num objeto TS,
// e o que faz o teste de acessibilidade valer alguma coisa: um objeto espelho
// so provaria que a copia esta consistente com ela mesma.
const BLOCK_SELECTOR = { claro: ":root", escuro: ".dark" } as const;

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Procura o seletor como cabecalho de bloco, e nao como texto solto: `.dark`
// tambem aparece dentro de `@custom-variant dark (&:is(.dark *))`, e casar com
// essa ocorrencia faria o parser ler o bloco seguinte (`@theme inline`) como se
// fosse o tema escuro -- silenciosamente, com tokens que existem.
function findBlockBody(css: string, selector: string): string | null {
  for (let from = css.indexOf(selector); from !== -1; from = css.indexOf(selector, from + 1)) {
    const rest = css.slice(from + selector.length);
    const open = rest.search(/\S/);
    if (open === -1 || rest[open] !== "{") {
      continue;
    }

    const close = rest.indexOf("}", open);
    if (close !== -1) {
      return rest.slice(open + 1, close);
    }
  }
  return null;
}

function readBlock(css: string, selector: string): Map<string, string> {
  const body = findBlockBody(css, selector);
  if (body === null) {
    return new Map();
  }

  const declarations = new Map<string, string>();
  for (const line of body.split(";")) {
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    const name = line.slice(0, separator).trim();
    if (name.startsWith("--")) {
      declarations.set(name, line.slice(separator + 1).trim());
    }
  }
  return declarations;
}

export function readThemeTokens(css: string): ThemeTokens {
  const clean = stripComments(css);
  return {
    claro: readBlock(clean, BLOCK_SELECTOR.claro),
    escuro: readBlock(clean, BLOCK_SELECTOR.escuro),
  };
}

const VAR_PATTERN = /^var\(\s*(--[\w-]+)\s*\)$/;
const MAX_INDIRECTION = 8;

// Alguns tokens apontam para outro (`--sidebar-primary: var(--primary)`), e o
// contraste tem que ser medido no valor final, nao no apelido.
export function resolveToken(tokens: ReadonlyMap<string, string>, name: string): Rgb | null {
  let value = tokens.get(name);

  for (let hop = 0; value !== undefined && hop < MAX_INDIRECTION; hop += 1) {
    const reference = VAR_PATTERN.exec(value);
    if (!reference) {
      return parseColor(value)?.rgb ?? null;
    }
    value = tokens.get(reference[1]);
  }

  return null;
}

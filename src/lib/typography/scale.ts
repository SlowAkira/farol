// Escala tipografica declarada em CSS, lida de volta para poder ser cobrada.
// Mora em src/lib pelo mesmo motivo que a matematica de cor mora: e funcao pura,
// e nenhum componente decide tamanho de fonte por conta propria.

const COMENTARIO = /\/\*[\s\S]*?\*\//g;
const DECLARACAO = /(--text-[\w-]+)\s*:/g;
const MODIFICADOR = "--line-height";

// `--text-metric--line-height` acompanha `--text-metric`: e o entrelinha daquele
// tamanho, e nao um setimo tamanho entrando pela porta dos fundos.
export function readFontSizeTokens(css: string): readonly string[] {
  const nomes = new Set<string>();

  for (const [, nome] of css.replace(COMENTARIO, "").matchAll(DECLARACAO)) {
    if (!nome.endsWith(MODIFICADOR)) {
      nomes.add(nome);
    }
  }

  return [...nomes].sort();
}

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AA_NON_TEXT, AA_TEXT, composite, contrastRatio } from "./contrast";
import { simulateDichromacy, type DichromacyKind } from "./cvd";
import { deltaE, type Rgb } from "./space";
import { readThemeTokens, resolveToken, type ThemeName } from "./theme";

// Guarda de acessibilidade da paleta. Le o CSS de verdade, entao trocar um token
// em globals.css sem conferir contraste quebra o CI aqui, e nao no print que
// alguem tira depois.
const tokens = readThemeTokens(readFileSync("src/app/globals.css", "utf8"));

const TEMAS = ["claro", "escuro"] as const satisfies readonly ThemeName[];

// Fundo de um par: ou um token direto, ou uma cor translucida composta sobre
// outra (o item ativo da navegacao usa `bg-primary/10`).
type Superficie = string | { readonly sobre: string; readonly cor: string; readonly opacidade: number };

type Par = {
  readonly frente: string;
  readonly fundo: Superficie;
  readonly minimo: number;
  readonly onde: string;
};

function cor(tema: ThemeName, nome: string): Rgb {
  const resolvida = resolveToken(tokens[tema], nome);
  expect(resolvida, `token ${nome} nao existe no tema ${tema}`).not.toBeNull();
  return resolvida as Rgb;
}

function superficie(tema: ThemeName, fundo: Superficie): Rgb {
  return typeof fundo === "string"
    ? cor(tema, fundo)
    : composite(cor(tema, fundo.cor), fundo.opacidade, cor(tema, fundo.sobre));
}

const NAV_ATIVO: Superficie = { sobre: "--sidebar", cor: "--primary", opacidade: 0.1 };

// O icone de alerta nao fica sobre o cartao: fica sobre um disco da propria cor
// a 10% (`bg-alert-warning/10` em EmptyState), que e mais claro no tema claro e
// mais escuro no escuro -- nos dois casos, mais perto do icone do que o cartao.
// Medir contra o cartao superestimava o contraste: o ambar anterior dava 3,05:1
// ali e 2,75:1 aqui, que e onde ele e realmente desenhado.
const DISCO_AVISO: Superficie = { sobre: "--card", cor: "--alert-warning", opacidade: 0.1 };
const DISCO_CRITICO: Superficie = { sobre: "--card", cor: "--alert-critical", opacidade: 0.1 };

// Só entra par que a interface realmente desenha. Token declarado e nunca
// renderizado (o `--destructive` do shadcn, por exemplo) ficaria de fora de
// proposito: a lista mede a tela, nao o arquivo.
const TEXTO: readonly Par[] = [
  {
    frente: "--foreground",
    fundo: "--background",
    minimo: AA_TEXT,
    onde: "texto da pagina e logo na landing",
  },
  { frente: "--card-foreground", fundo: "--card", minimo: AA_TEXT, onde: "texto do cartao" },
  {
    frente: "--muted-foreground",
    fundo: "--card",
    minimo: AA_TEXT,
    onde: "rotulo de KPI, tick de eixo e cabecalho de tabela",
  },
  {
    frente: "--muted-foreground",
    fundo: "--background",
    minimo: AA_TEXT,
    onde: "subtitulo do cabecalho",
  },
  {
    frente: "--popover-foreground",
    fundo: "--popover",
    minimo: AA_TEXT,
    onde: "titulo do tooltip",
  },
  {
    frente: "--muted-foreground",
    fundo: "--popover",
    minimo: AA_TEXT,
    onde: "rotulo de serie no tooltip",
  },
  {
    frente: "--primary-foreground",
    fundo: "--primary",
    minimo: AA_TEXT,
    onde: "botao preenchido",
  },
  {
    frente: "--primary-foreground",
    fundo: "--brand-hover",
    minimo: AA_TEXT,
    onde: "botao preenchido sob o cursor",
  },
  {
    frente: "--primary-foreground",
    fundo: "--brand-active",
    minimo: AA_TEXT,
    onde: "botao preenchido pressionado",
  },
  {
    frente: "--brand-link",
    fundo: "--card",
    minimo: AA_TEXT,
    onde: "link de campanha na tabela",
  },
  {
    frente: "--brand-link",
    fundo: "--background",
    minimo: AA_TEXT,
    onde: "link de voltar ao dashboard",
  },
  { frente: "--state-positive", fundo: "--card", minimo: AA_TEXT, onde: "delta de melhora" },
  { frente: "--state-negative", fundo: "--card", minimo: AA_TEXT, onde: "delta de piora" },
  {
    frente: "--sidebar-foreground",
    fundo: "--sidebar",
    minimo: AA_TEXT,
    onde: "item de navegacao e logo na sidebar",
  },
  {
    frente: "--brand-link",
    fundo: NAV_ATIVO,
    minimo: AA_TEXT,
    onde: "item de navegacao ativo",
  },
  {
    frente: "--accent-foreground",
    fundo: "--accent",
    minimo: AA_TEXT,
    onde: "item de menu sob o cursor",
  },
  {
    frente: "--secondary-foreground",
    fundo: "--secondary",
    minimo: AA_TEXT,
    onde: "botao secundario",
  },
];

const NAO_TEXTO: readonly Par[] = [
  { frente: "--chart-1", fundo: "--card", minimo: AA_NON_TEXT, onde: "serie de barras" },
  { frente: "--chart-2", fundo: "--card", minimo: AA_NON_TEXT, onde: "serie de linha" },
  {
    frente: "--alert-warning",
    fundo: DISCO_AVISO,
    minimo: AA_NON_TEXT,
    onde: "icone de alerta de degradacao",
  },
  {
    frente: "--alert-critical",
    fundo: DISCO_CRITICO,
    minimo: AA_NON_TEXT,
    onde: "icone de alerta de falha",
  },
  { frente: "--ring", fundo: "--background", minimo: AA_NON_TEXT, onde: "anel de foco na pagina" },
  { frente: "--ring", fundo: "--card", minimo: AA_NON_TEXT, onde: "anel de foco sobre cartao" },
  {
    frente: "--ring",
    fundo: "--popover",
    minimo: AA_NON_TEXT,
    onde: "anel de foco em item de menu",
  },
  {
    frente: "--sidebar-ring",
    fundo: "--sidebar",
    minimo: AA_NON_TEXT,
    onde: "anel de foco na navegacao",
  },
];

function tokensDeCor(tema: ThemeName): string[] {
  return [...tokens[tema].keys()].filter((nome) => resolveToken(tokens[tema], nome) !== null).sort();
}

describe("tokens de tema", () => {
  // Token de cor que existe so num tema vira fallback silencioso para o valor do
  // `:root` no outro -- some do radar do audit acima, porque ninguem o lista.
  // Nao-cores (`--radius`) sao declaradas so no claro de proposito.
  it("declara as mesmas cores nos dois temas", () => {
    expect(tokensDeCor("claro")).toEqual(tokensDeCor("escuro"));
  });
});

describe.each(TEMAS)("contraste WCAG AA no tema %s", (tema) => {
  it.each([...TEXTO, ...NAO_TEXTO])(
    "$frente sobre $fundo ($onde) atinge o minimo",
    ({ frente, fundo, minimo }) => {
      const razao = contrastRatio(cor(tema, frente), superficie(tema, fundo));
      // Arredonda para baixo em 2 casas: 4.4999 nao vira "4.5 passou".
      expect(Math.floor(razao * 100) / 100).toBeGreaterThanOrEqual(minimo);
    },
  );
});

// As duas series ja se distinguem por forma (barra x linha, em paineis
// separados com titulo proprio), entao a cor nunca e o unico sinal. Ainda assim
// elas aparecem lado a lado no tooltip, e ali a chave e so a cor -- por isso o
// piso de separacao tambem vale sob dicromacia.
const SEPARACAO_MINIMA = 20;
const DICROMACIAS = ["protanopia", "deuteranopia"] as const satisfies readonly DichromacyKind[];

describe.each(TEMAS)("series do grafico no tema %s", (tema) => {
  it("separa as duas series na visao normal", () => {
    expect(deltaE(cor(tema, "--chart-1"), cor(tema, "--chart-2"))).toBeGreaterThanOrEqual(
      SEPARACAO_MINIMA,
    );
  });

  it.each(DICROMACIAS)("mantem as duas series distinguiveis sob %s", (tipo) => {
    const separacao = deltaE(
      simulateDichromacy(cor(tema, "--chart-1"), tipo),
      simulateDichromacy(cor(tema, "--chart-2"), tipo),
    );

    expect(separacao).toBeGreaterThanOrEqual(SEPARACAO_MINIMA);
  });

  // Serie que some no fundo nao e separavel de coisa nenhuma, com ou sem
  // daltonismo: o piso de 3:1 tem que valer tambem na cor simulada.
  it.each(DICROMACIAS)("mantem cada serie visivel contra o cartao sob %s", (tipo) => {
    const fundo = simulateDichromacy(cor(tema, "--card"), tipo);

    for (const serie of ["--chart-1", "--chart-2"]) {
      const razao = contrastRatio(simulateDichromacy(cor(tema, serie), tipo), fundo);
      expect(razao, `${serie} sob ${tipo}`).toBeGreaterThanOrEqual(AA_NON_TEXT);
    }
  });
});

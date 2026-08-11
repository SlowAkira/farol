import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE_URL = process.env.SHOTS_BASE_URL ?? "http://localhost:3000";
const OUTPUT_DIR = ".screenshots";

// O script nao sobe o servidor: fotografa o que ja estiver de pe em BASE_URL.
// Gerenciar o ciclo de vida do `next dev` daqui significaria matar arvore de
// processo no Windows, e um servidor orfao segurando a porta 3000 custa mais
// caro que a linha de instrucao que este script imprime quando nao acha nada.
// O mesmo SHOTS_BASE_URL aponta para um `next start` quando o que se quer
// fotografar e o build de producao, sem o overlay de dev.
const USO = "suba o app antes (npm run dev) ou aponte SHOTS_BASE_URL para onde ele esta.";

const ROTAS = [
  { nome: "landing", caminho: "/" },
  { nome: "dashboard", caminho: "/dashboard" },
  { nome: "campanhas", caminho: "/campaigns" },
  { nome: "alertas", caminho: "/alerts" },
] as const;

// O valor guardado e o que o next-themes le do localStorage (`attribute="class"`,
// storageKey padrao "theme" em src/app/layout.tsx). Alternar pelo botao daria o
// mesmo resultado com muito mais passos e uma corrida com a hidratacao.
const TEMAS = [
  { nome: "claro", armazenado: "light" },
  { nome: "escuro", armazenado: "dark" },
] as const;

// 375 e o iPhone SE, o piso real de celular; 768 e o ponto onde a sidebar deixa
// de ser faixa e vira coluna (`md:` do Tailwind); 1440 e o desktop comum.
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
] as const;

const THEME_STORAGE_KEY = "theme";
const NAVIGATION_TIMEOUT_MS = 60_000;

type Resultado = {
  readonly arquivo: string;
  readonly transbordo: number;
};

type Alcance = { readonly ok: true } | { readonly ok: false; readonly motivo: string };

// Timeout de navegacao, e nao de ping: o `next dev` compila a rota na primeira
// visita, e um servidor recem-subido leva dezenas de segundos para responder a
// primeira vez. Com 5 segundos o script desistia de um servidor que estava de pe
// e so estava compilando. De quebra, esta requisicao ja aquece a landing.
async function alcancarServidor(): Promise<Alcance> {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(NAVIGATION_TIMEOUT_MS) });
    if (response.ok) {
      return { ok: true };
    }

    // Servidor de pe respondendo erro e um problema diferente de servidor no ar
    // nenhum, e mandar "suba o app" para quem ja subiu manda procurar no lugar
    // errado.
    return { ok: false, motivo: `${BASE_URL} respondeu ${response.status}.` };
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    return { ok: false, motivo: `nada respondendo em ${BASE_URL} (${detalhe}): ${USO}` };
  }
}

// Largura de rolagem maior que a da janela e a assinatura de layout quebrado no
// celular, e nao aparece no print: a foto corta exatamente a parte que vazou.
// Medir aqui transforma "parece ok" em numero.
async function transbordoHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    return Math.max(0, scrollWidth - clientWidth);
  });
}

async function capturar(page: Page, caminho: string, arquivo: string): Promise<Resultado> {
  await page.goto(`${BASE_URL}${caminho}`, {
    waitUntil: "networkidle",
    timeout: NAVIGATION_TIMEOUT_MS,
  });

  // O overlay do `next dev` fica sobre o canto da tela e entraria em todo print.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  const transbordo = await transbordoHorizontal(page);
  await page.screenshot({ path: arquivo, fullPage: true, animations: "disabled" });

  return { arquivo, transbordo };
}

async function main(): Promise<void> {
  const alcance = await alcancarServidor();
  if (!alcance.ok) {
    console.error(alcance.motivo);
    process.exitCode = 1;
    return;
  }

  // O navegador sobe antes de apagar a pasta: sem o binario instalado o launch
  // falha, e falhar depois do rm deixaria o usuario sem os prints novos e sem os
  // antigos. Apagar a pasta inteira, e nao sobrescrever arquivo a arquivo, e o
  // que impede sobra de rota renomeada de passar por print atual.
  const browser = await chromium.launch();
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });

  const resultados: Resultado[] = [];

  try {
    for (const tema of TEMAS) {
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
        await context.addInitScript(
          ([chave, valor]: readonly [string, string]) => {
            window.localStorage.setItem(chave, valor);
          },
          [THEME_STORAGE_KEY, tema.armazenado] as const,
        );

        const page = await context.newPage();

        for (const rota of ROTAS) {
          // Largura com zero a esquerda so para o nome ordenar na mesma ordem em
          // que a tela cresce: 0375 antes de 0768 antes de 1440.
          const largura = String(viewport.width).padStart(4, "0");
          const arquivo = join(OUTPUT_DIR, `${rota.nome}-${tema.nome}-${largura}.png`);
          resultados.push(await capturar(page, rota.caminho, arquivo));
          console.log(arquivo);
        }

        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const transbordados = resultados.filter((resultado) => resultado.transbordo > 0);
  console.log(`\n${resultados.length} prints em ${OUTPUT_DIR}/`);

  if (transbordados.length > 0) {
    console.warn(`\n${transbordados.length} com rolagem horizontal (layout vazando):`);
    for (const { arquivo, transbordo } of transbordados) {
      console.warn(`  ${arquivo}: ${transbordo}px alem da janela`);
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

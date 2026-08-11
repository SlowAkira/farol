# Farol

Painel de performance de tráfego pago. Usuários conectam contas de anúncios; o
sistema ingere métricas diárias e mostra evolução, comparação entre períodos e
alertas automáticos de anomalia.

## Arquitetura

- Toda leitura de dados externos passa pela interface `AdsProvider` em
  `src/lib/providers/types.ts`. Nenhum arquivo fora de `src/lib/providers` pode
  importar SDK de plataforma de anúncios ou fazer fetch direto a ela.
- Métricas derivadas (ROAS, CPA, CTR, CPM, frequência) são calculadas apenas em
  `src/lib/metrics/`. Componentes React nunca dividem um número por outro.
- Valores monetários são inteiros em centavos. Nunca float.
- Datas de métricas são strings `YYYY-MM-DD` no fuso da conta de anúncios,
  nunca `Date` com hora. O ISO é formato de transporte: vale na URL, no banco e
  entre funções. Data que aparece para uma pessoa passa por `formatDay` /
  `formatPeriod` de `src/lib/format.ts` e sai legível ("30 jul a 5 ago"). Eixo
  de gráfico e coluna de tabela seguem em `formatDayLabel` (`30/07`), que é
  curto e de largura constante.
- Server Components por padrão. `"use client"` só com interatividade real, e o
  componente cliente é folha da árvore, não raiz.
- Nenhum acesso ao Prisma em componente. Queries ficam em `src/lib/db/` e são
  chamadas por Server Components ou route handlers.

## Design

- Tema claro e escuro, ambos suportados, com toggle acessível. Escuro é o
  padrão. Nenhuma cor hardcoded em componente: tudo via tokens CSS do shadcn.
- Superfície: um tom escuro quase neutro como base, com elevação feita por
  camadas mais claras, nunca por sombra pesada. Três níveis, e só três:
  `--surface-base` (fundo da página e sidebar), `--surface-card` (cartão) e
  `--surface-raised` (popover, tooltip, menu). O tema claro segue a mesma
  lógica invertida: a elevação caminha para o branco.
- Cor de marca: violeta dessaturado, usado só onde há interação — navegação
  ativa, botão primário, anel de foco e link. Nada de roxo vibrante, e nada de
  marca em elemento que não responde ao cursor nem ao teclado. Tons de hover,
  ativo e desabilitado definidos como variáveis e validados para AA nos dois
  temas.
- Âmbar e vermelho são cores de alerta, e só isso: `--alert-warning` para
  degradação e `--alert-critical` para falha. Não são cor de logo, de botão nem
  de série. O logo usa a cor de texto primário.
- Cores de estado (verde de melhora, vermelho de piora) são independentes da
  marca e do alerta, e nunca são o único sinal: sempre acompanhadas de seta ou
  sinal, para funcionar em daltonismo.
- Paleta de dados independente da marca, seguindo a skill `dataviz`: oito
  matizes em ordem fixa — azul, laranja, aqua, amarelo, magenta, verde, violeta,
  vermelho — atribuídas em sequência e nunca cicladas. O painel desenha no
  máximo duas séries por vez, então só os dois primeiros slots existem como
  token. Um terceiro slot já nasce sendo aqua; escolher a cor no olho é o que a
  ordem fixa existe para impedir.
- Densidade espaçada: cartões grandes, números em destaque, generoso em
  espaço em branco. Preferir legibilidade a caber mais dado por tela.
- Hierarquia do dashboard: KPIs do período no topo, gráfico de evolução no
  meio, tabela de campanhas embaixo.
- Tipografia Geist via `next/font`, com escala explícita de seis tamanhos em
  token (`--text-label`, `--text-body`, `--text-lead`, `--text-section`,
  `--text-metric`, `--text-display`) e nenhum sétimo. `tabular-nums` só onde
  número alinha em coluna: célula de tabela e tick de eixo. Valor grande e
  isolado fica em figura proporcional, com largura mínima reservada no
  container para o layout não empurrar quando o número muda de tamanho.
- Movimento discreto e funcional, entre 150ms e 300ms, com `--ease-soft`:
  cartões entram com 8px de deslocamento e opacidade ao chegar na viewport, uma
  única vez; valores de KPI contam de zero; o gráfico desenha as séries uma vez
  ao carregar; skeleton com shimmer; hover e foco com transição curta. Tudo isso
  respeita `prefers-reduced-motion` — com a preferência ativa nada anima e os
  valores aparecem direto. O estado final tem que ser idêntico nos dois
  caminhos: animação nunca é o que torna o conteúdo visível.

## Estilo

- Sem comentários óbvios; comentário só explica o porquê, nunca o quê.
- Funções puras sempre que possível.
- Erros de domínio são tipos de retorno, não exceções.

## Testes

- Lógica de métricas, ingestão e regras de alerta: teste unitário obrigatório.
- Contraste e daltonismo são cobrados pelo CI: `src/lib/color/accessibility.test.ts`
  lê o `globals.css` de verdade e mede cada par sobre a superfície em que ele é
  de fato desenhado — inclusive as compostas (`bg-primary/10` da navegação
  ativa, disco `/10` do ícone de alerta). Token novo que reprova se ajusta; o
  teste não.
- UI não tem teste unitário; um único fluxo crítico coberto por Playwright.
- `npm run shots` fotografa landing, dashboard, campanhas e alertas nos dois
  temas em 375px, 768px e 1440px, e grava em `.screenshots/` (fora do git).
  Precisa do app de pé; `SHOTS_BASE_URL` aponta para outra origem.

## Fluxo de trabalho

- Decida sozinho quando existir um caminho padrão defensável. Só pergunte
  quando a decisão for irreversível, custar mais de uma hora para desfazer,
  ou envolver trade-off que só o dono do produto resolve.
- Ao decidir sozinho, registre a decisão e o motivo no resumo final.
- Nunca interrompa para pedir aprovação de comando de leitura.

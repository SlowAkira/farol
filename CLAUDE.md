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
  nunca `Date` com hora.
- Server Components por padrão. `"use client"` só com interatividade real, e o
  componente cliente é folha da árvore, não raiz.
- Nenhum acesso ao Prisma em componente. Queries ficam em `src/lib/db/` e são
  chamadas por Server Components ou route handlers.

## Design

- Tema claro e escuro, ambos suportados, com toggle acessível. Escuro é o
  padrão. Nenhuma cor hardcoded em componente: tudo via tokens CSS do shadcn.
- Cor de marca: roxo, usada em botões, links e elementos de navegação. Paleta
  definida como variáveis com tons de hover, ativo e desabilitado, validados
  para contraste AA nos dois temas.
- Cor de acento: âmbar, reservada ao logo, ao ícone de alerta e a nada mais.
  É a assinatura visual do Farol e não pode virar cor de botão comum.
- Densidade espaçada: cartões grandes, números em destaque, generoso em
  espaço em branco. Preferir legibilidade a caber mais dado por tela.
- Hierarquia do dashboard: KPIs do período no topo, gráfico de evolução no
  meio, tabela de campanhas embaixo.
- Cores de estado (verde de melhora, vermelho de piora) são independentes da
  cor de marca e nunca são o único sinal: sempre acompanhadas de seta ou
  sinal, para funcionar em daltonismo.

## Estilo

- Sem comentários óbvios; comentário só explica o porquê, nunca o quê.
- Funções puras sempre que possível.
- Erros de domínio são tipos de retorno, não exceções.

## Testes

- Lógica de métricas, ingestão e regras de alerta: teste unitário obrigatório.
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

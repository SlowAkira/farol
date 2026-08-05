@AGENTS.md

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

## Estilo

- Sem comentários óbvios; comentário só explica o porquê, nunca o quê.
- Funções puras sempre que possível.
- Erros de domínio são tipos de retorno, não exceções.

## Testes

- Lógica de métricas, ingestão e regras de alerta: teste unitário obrigatório.
- UI não tem teste unitário; um único fluxo crítico coberto por Playwright.

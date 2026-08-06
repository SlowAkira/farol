---
description: Fluxo completo de uma fase de trabalho — branch, implementação, check, code review, commit, PR, espera do CI e merge.
argument-hint: [descrição da tarefa]
---

Execute o fluxo abaixo, do início ao fim, para a tarefa: $ARGUMENTS

Pare e avise o usuário se qualquer etapa falhar — não pule para a próxima
etapa com um passo anterior quebrado, e não use `--no-verify` ou flags
equivalentes para contornar falhas.

1. **Branch**
   - Rode `git status`. Se houver mudanças não commitadas que não pertencem
     a esta tarefa, pare e pergunte ao usuário como proceder.
   - Atualize master: `git checkout master && git pull origin master`.
   - Crie uma branch nova a partir de master, com nome descritivo em
     kebab-case prefixado por tipo (`feat/`, `fix/`, `chore/`, `refactor/`),
     coerente com a tarefa.

2. **Implementação**
   - Implemente a tarefa descrita em $ARGUMENTS, seguindo as regras de
     `CLAUDE.md` (interface `AdsProvider`, métricas derivadas só em
     `src/lib/metrics/`, valores monetários em centavos, datas `YYYY-MM-DD`,
     Server Components por padrão, sem Prisma em componente).

3. **Check**
   - Rode `npm run check` (typecheck + eslint + testes). Corrija qualquer
     falha antes de seguir. Não prossiga com o check quebrado.

4. **Code review**
   - Rode `/code-review low` sobre o diff da branch e aplique as correções
     que fizerem sentido antes de commitar.
   - Nunca rode o workflow dinâmico (multi-agent, em background) nessa
     etapa — só a revisão inline.

5. **Commit**
   - Stage apenas os arquivos relevantes à tarefa (nunca `git add -A` às
     cegas) e crie o commit com mensagem clara em português, focada no
     porquê da mudança.

6. **PR**
   - Push da branch e `gh pr create` com título curto e corpo explicando o
     que mudou e por quê, mais um checklist de teste.

7. **Aguardar CI**
   - Acompanhe o PR com `gh pr checks --watch`. Se o check "CI" falhar,
     investigue a causa, corrija, empurre um novo commit e aguarde de novo —
     não faça merge com CI vermelho ou pendente.

8. **Merge**
   - Confirme com o usuário antes de mergear. Depois de aprovado, faça o
     merge do PR (`gh pr merge`) — a branch protection de master exige PR e
     o check "CI" verde, então o merge só é aceito se as duas condições
     estiverem satisfeitas.

9. **Pull**
   - Volte para master local e sincronize: `git checkout master && git pull
     origin master`. Apague a branch local da tarefa se o merge remoto já a
     removeu.

# Farol

Painel de performance de tráfego pago: ingestão de métricas diárias, evolução, comparação entre períodos e alertas de anomalia.

## Rodando localmente

```bash
cp .env.example .env
npm install
npm run db            # sobe o Postgres local em portas fixas (deixe rodando)
npx prisma migrate dev
npm run dev
```

`npm run db` fixa as portas do `prisma dev` (51213/51214/51215) num servidor
chamado `farol`. É o que impede o `DATABASE_URL` do `.env` de quebrar a cada
reinício — sem as portas fixas o `prisma dev` sorteia uma porta livre toda vez.
Para derrubar: `npm run db:stop`.

`npm run build` roda `prisma migrate deploy` antes do `next build` e por isso
exige o banco de pé; em local o `prisma dev` cai sozinho com alguma frequência
(`P1001`/`P1017`, às vezes deixando um `server.lock.lock` órfão que impede o
`npm run db` seguinte) — reinicie o banco e repita, porque na Vercel o Postgres
é Neon real e não tem esse comportamento.

`npm test` rodando o arquivo inteiro pode falhar em local com `bind message
supplies N parameters, but prepared statement "" requires 0` quando dois
arquivos de teste abrem conexão com o banco ao mesmo tempo: o `prisma dev` é
`@electric-sql/pglite` atrás de um socket, não Postgres de verdade, e não
isola direito sessões concorrentes — o CI roda contra Postgres real em
container e não reproduz o problema.

## Autenticação e modo demo

Auth.js v5 com dois provedores: credenciais de demo (sem senha, loga direto no
usuário fixo `demo@farol.app`) e Google OAuth (secundário, só aparece na
landing quando `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` estão definidas). O
middleware protege tudo em `/dashboard`, `/campaigns` e `/alerts`; sem sessão,
redireciona para a landing, que é a própria tela de login.

A conta demo é **somente leitura**: `src/lib/auth/demo-guard.ts` expõe
`assertWritable(session)`, que toda mutação futura chama antes de escrever e
trata como erro de domínio (retorno, não exceção) se a sessão for a demo.

```bash
npm run db:seed     # popula/atualiza o usuário demo, sem apagar nada
npm run db:reset     # zera o banco local e roda o seed de novo
```

`prisma/seed.ts` cria o usuário demo, a conta sintética completa (4
campanhas, 120 dias de insights, via `generateAccount` de
`src/lib/mock/generator.ts`) e três regras de alerta pré-configuradas — uma
delas (custo por lead) dispara de verdade contra o dado sintético, porque o
gerador já degrada o CPA da campanha de leads a partir do dia 95. Todo o seed
usa upsert/`skipDuplicates`, então rodar duas vezes não duplica nada.

Para rodar o seed contra o banco de produção no Neon (ex.: para a conta demo
existir antes do primeiro deploy), aponte `DIRECT_URL` para a URL direta
(sem `-pooler`) do Neon — o script prefere `DIRECT_URL` sobre `DATABASE_URL`
pelo mesmo motivo do `migrationUrl()` em `prisma.config.ts`: upsert/createMany
em lote não deveria abrir conexão em modo transação do PgBouncer:

```bash
DIRECT_URL="postgres://usuario:senha@ep-xxxx.neon.tech/neondb?sslmode=require" npm run db:seed
```

**Decisão registrada:** as queries em `src/lib/db/` (`accounts.ts`,
`campaigns.ts`, `insights.ts`) ainda não são filtradas por usuário — hoje só
existe o usuário demo com dado de verdade, e o Google OAuth está sem
credenciais, então não há um segundo usuário real para vazar dado. Assim que
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` forem configuradas, isso muda: um
usuário Google autenticado veria a mesma conta demo, porque nenhuma query
depende de `session.user.id`. Escopar por usuário fica para quando o
onboarding real (conectar a própria conta de anúncios) existir — hoje seria
um refactor sem um segundo dono de dado para testar contra.

## Sincronização

Ingestão de uma conta específica, na máquina local:

```bash
npm run sync -- <adAccountId> [--lookback <dias>]
```

Em produção, `POST /api/cron/sync` sincroniza todas as contas conectadas, três
em paralelo. A rota exige `Authorization: Bearer $CRON_SECRET` e também aceita
`GET`, que é como o Vercel Cron dispara — o agendamento diário das 9h UTC está
em `vercel.json`. Cada sincronização sai como uma linha de JSON no log.

## O que ficou de fora e por quê

**Banco separado para preview.** Preview e produção apontam para o mesmo banco
Neon. Aceitável hoje porque os dados são mock e regeneráveis, e montar branching
de banco agora custaria mais do que resolve. O risco é concreto e conhecido:
`npm run build` roda `prisma migrate deploy`, e todo deployment faz build — uma
migration destrutiva num PR é aplicada em produção assim que o preview constrói,
antes de qualquer revisão. Enquanto for assim, migration que dropa coluna ou
tabela precisa de branch de banco própria ou de ser dividida em passos
compatíveis com o schema anterior.

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

## Sincronização

Ingestão de uma conta específica, na máquina local:

```bash
npm run sync -- <adAccountId> [--lookback <dias>]
```

Em produção, `POST /api/cron/sync` sincroniza todas as contas conectadas, três
em paralelo. A rota exige `Authorization: Bearer $CRON_SECRET` e também aceita
`GET`, que é como o Vercel Cron dispara — o agendamento diário das 9h UTC está
em `vercel.json`. Cada sincronização sai como uma linha de JSON no log.

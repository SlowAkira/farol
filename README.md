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

## Sincronização

Ingestão de uma conta específica, na máquina local:

```bash
npm run sync -- <adAccountId> [--lookback <dias>]
```

Em produção, `POST /api/cron/sync` sincroniza todas as contas conectadas, três
em paralelo. A rota exige `Authorization: Bearer $CRON_SECRET` e também aceita
`GET`, que é como o Vercel Cron dispara — o agendamento diário das 9h UTC está
em `vercel.json`. Cada sincronização sai como uma linha de JSON no log.

// E-mail fixo do usuario criado por prisma/seed.ts. auth.ts usa isto so no
// provider "demo" (authorize nao recebe senha, entao nao ha outro jeito de
// saber qual usuario logar); todo resto do app le a flag isDemo da sessao.
export const DEMO_USER_EMAIL = "demo@farol.app";

// Google fica fora do array de providers quando faltam as credenciais, em vez
// de entrar configurado com string vazia: assim nem o build nem /login quebram
// sem GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, e o botao correspondente some.
export function isGoogleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getPrisma } from "@/lib/db/client";
import { DEMO_USER_EMAIL, isGoogleAuthConfigured } from "@/lib/auth/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(getPrisma()),
  // Credentials provider so roda com sessao JWT -- Auth.js recusa "database"
  // nesse caso porque authorize() nao passa por cima do adapter, entao nao
  // haveria linha de Session para a strategy database ler.
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: "demo",
      name: "Modo demo",
      // Sem campos: o botao "Ver modo demo" da landing nao pede nada, so
      // confirma o usuario fixo que prisma/seed.ts ja deixou pronto.
      credentials: {},
      async authorize() {
        const demoUser = await getPrisma().user.findUnique({
          where: { email: DEMO_USER_EMAIL },
        });

        // null aqui vira "CredentialsSignin" para quem chamou signIn() --
        // acontece se alguem clicar em "Ver modo demo" antes do seed rodar.
        if (!demoUser) {
          return null;
        }

        return {
          id: demoUser.id,
          email: demoUser.email,
          name: demoUser.name,
          image: demoUser.image,
        };
      },
    }),
    ...(isGoogleAuthConfigured()
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    // O id do usuario demo e fixo (mesmo e-mail a cada seed), mas o token JWT
    // so recebe `user` no login -- por isso a flag e calculada aqui e carregada
    // no token, e nao recalculada a cada leitura de sessao.
    async jwt({ token, user }) {
      if (user?.email) {
        token.isDemo = user.email === DEMO_USER_EMAIL;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.isDemo = token.isDemo ?? false;
      return session;
    },
  },
  // A landing (marketing/page.tsx) e a propria tela de login: tem o botao
  // primario da demo e o secundario do Google. Sem pagina /login dedicada,
  // redirecionar para "/" e o unico destino que faz sentido.
  pages: {
    signIn: "/",
  },
});

import type { DefaultSession } from "next-auth";

// isDemo nasce no provider "demo" (auth.ts) e viaja token -> session pelos
// callbacks jwt/session. Sem este augment, session.user.isDemo nao teria tipo
// e todo chamador (assertWritable, UI) precisaria de un `as` para le-lo.
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      // Dono da sessao. Toda escrita de regra e de alerta entra no `where` com
      // ele: o id do recurso viaja pela server action e e editavel por quem
      // chama, entao a posse nunca pode ser deduzida do id sozinho.
      id: string;
      isDemo: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    isDemo?: boolean;
  }
}

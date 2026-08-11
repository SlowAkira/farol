import type { DefaultSession } from "next-auth";

// isDemo nasce no provider "demo" (auth.ts) e viaja token -> session pelos
// callbacks jwt/session. Sem este augment, session.user.isDemo nao teria tipo
// e todo chamador (assertWritable, UI) precisaria de un `as` para le-lo.
declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      isDemo: boolean;
    };
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    isDemo?: boolean;
  }
}

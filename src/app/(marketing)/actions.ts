"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

// signIn() com redirectTo lanca um redirect interno do Next quando da certo --
// isso nao e erro e nao pode ser capturado. So AuthError (ex.: seed nunca
// rodou, entao authorize() devolveu null) vira mensagem amigavel aqui.
export async function signInDemo(): Promise<void> {
  try {
    await signIn("demo", { redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) {
      throw new Error(
        "Não foi possível entrar no modo demo. Rode `npm run db:seed` e tente de novo.",
      );
    }
    throw error;
  }
}

export async function signInGoogle(): Promise<void> {
  await signIn("google", { redirectTo: "/dashboard" });
}

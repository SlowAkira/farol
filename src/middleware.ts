import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Rotas reais do grupo (app) -- grupo de rotas nao aparece na URL, entao o
// matcher precisa listar os paths de verdade (dashboard/campaigns/alerts) em
// vez do nome do grupo.
export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/campaigns/:path*", "/alerts/:path*"],
  // auth.ts importa o PrismaAdapter, que usa modulos nativos do Node (fs, os,
  // path). O runtime Edge padrao do middleware nao bundla isso; Node.js
  // Middleware (estavel desde o Next 15.2) resolve sem precisar duplicar a
  // config de auth so para o middleware.
  runtime: "nodejs",
};

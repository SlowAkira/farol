import { Button } from "@/components/ui/button";
import { isGoogleAuthConfigured } from "@/lib/auth/env";
import { signInDemo, signInGoogle } from "./actions";

export default function MarketingPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-6 py-24 text-center">
      <span className="text-xl font-semibold text-brand-amber">Farol</span>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        Performance de tráfego pago, num painel só
      </h1>
      <p className="text-lg text-muted-foreground text-balance">
        Conecte suas contas de anúncios e acompanhe evolução, comparação entre
        períodos e alertas automáticos de anomalia.
      </p>
      <div className="flex flex-col items-center gap-3">
        <form action={signInDemo}>
          <Button type="submit" size="lg">
            Ver modo demo
          </Button>
        </form>
        {isGoogleAuthConfigured() && (
          <form action={signInGoogle}>
            <Button type="submit" variant="outline" size="sm">
              Entrar com Google
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}

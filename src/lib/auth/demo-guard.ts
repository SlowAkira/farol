import type { Session } from "next-auth";

export type DemoReadOnlyError = {
  readonly type: "DEMO_READ_ONLY";
  readonly message: string;
};

// Erro de dominio, nao excecao (CLAUDE.md): toda server action que grava dado
// chama isto primeiro e trata o retorno como o AdsProvider trata os proprios
// erros -- um valor, nunca um catch. Nenhuma mutacao existe ainda nesta fase;
// isto e a fronteira que a proxima vai chamar antes de escrever.
export function assertWritable(session: Session | null): DemoReadOnlyError | null {
  if (!session?.user?.isDemo) {
    return null;
  }

  return {
    type: "DEMO_READ_ONLY",
    message: "Esta é a conta demo, somente leitura. Conecte sua própria conta para editar.",
  };
}

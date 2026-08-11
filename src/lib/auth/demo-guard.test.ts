import { describe, expect, it } from "vitest";
import { assertWritable } from "./demo-guard";

function session(isDemo: boolean) {
  return {
    user: { isDemo },
    expires: "2026-12-31T00:00:00.000Z",
  } as never;
}

describe("assertWritable", () => {
  it("devolve erro de dominio para a sessao demo", () => {
    const error = assertWritable(session(true));
    expect(error).toEqual({
      type: "DEMO_READ_ONLY",
      message: "Esta é a conta demo, somente leitura. Conecte sua própria conta para editar.",
    });
  });

  it("devolve null para sessao real", () => {
    expect(assertWritable(session(false))).toBeNull();
  });

  it("devolve null sem sessao", () => {
    expect(assertWritable(null)).toBeNull();
  });
});

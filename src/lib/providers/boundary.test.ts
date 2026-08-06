import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Prova que a fronteira do CLAUDE.md e verificavel, e nao so convencao: roda o
// eslint do projeto sobre codigo em memoria e confere quem passa e quem nao passa.
const eslint = new ESLint();
const RULE = "no-restricted-imports";

async function violations(source: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(`${source}\n`, { filePath, warnIgnored: false });
  return (result?.messages ?? [])
    .filter((message) => message.ruleId === RULE)
    .map((message) => message.message);
}

const OUTSIDE = "src/app/dashboard/page.ts";
const INSIDE = "src/lib/providers/index.ts";

describe("fronteira da camada de providers", () => {
  it("barra deep import de mock e meta fora da camada", async () => {
    const forms = [
      'import { MockProvider } from "@/lib/providers/mock";',
      'import { MetaProvider } from "@/lib/providers/meta";',
      'import { MockProvider } from "../../lib/providers/mock";',
      'import { MetaProvider } from "../providers/meta";',
      'import type { MockProviderConfig } from "@/lib/providers/mock";',
    ];

    for (const form of forms) {
      expect(await violations(form, OUTSIDE), form).not.toEqual([]);
    }
  }, 30_000);

  it("barra SDK de plataforma fora da camada", async () => {
    expect(
      await violations('import { AdAccount } from "facebook-nodejs-business-sdk";', OUTSIDE),
    ).not.toEqual([]);
    expect(await violations('import { GoogleAdsApi } from "google-ads-api";', OUTSIDE)).not.toEqual(
      [],
    );
  }, 30_000);

  it("libera o barrel, que e a porta de entrada oficial", async () => {
    const forms = [
      'import { getProvider } from "@/lib/providers";',
      'import type { ProviderInsight } from "@/lib/providers";',
    ];

    for (const form of forms) {
      expect(await violations(form, OUTSIDE), form).toEqual([]);
    }
  }, 30_000);

  it("nao atrapalha quem esta dentro da camada", async () => {
    const forms = [
      'import { MockProvider } from "./mock";',
      'import { MetaProvider } from "@/lib/providers/meta";',
      'import { AdAccount } from "facebook-nodejs-business-sdk";',
    ];

    for (const form of forms) {
      expect(await violations(form, INSIDE), form).toEqual([]);
    }
  }, 30_000);
});

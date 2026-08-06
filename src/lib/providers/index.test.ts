import { afterEach, describe, expect, it } from "vitest";
import { Platform } from "@/generated/prisma/enums";
import { NotImplementedError, ProviderConfigError } from "./errors";
import { getProvider } from "./index";
import { MetaProvider } from "./meta";
import { MockProvider } from "./mock";

const original = process.env.DATA_PROVIDER;
const originalNodeEnv = process.env.NODE_ENV;

function setSource(value: string | undefined): void {
  if (value === undefined) {
    delete process.env.DATA_PROVIDER;
    return;
  }
  process.env.DATA_PROVIDER = value;
}

// NODE_ENV e readonly no tipo do Next, mas process.env exige descritor de dado
// completo: sem `enumerable` o defineProperty e recusado em runtime.
function setNodeEnv(value: string): void {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

afterEach(() => {
  setSource(original);
  setNodeEnv(originalNodeEnv);
});

describe("getProvider", () => {
  it("cai no mock quando DATA_PROVIDER esta ausente ou vazio", () => {
    setSource(undefined);
    expect(getProvider(Platform.META)).toBeInstanceOf(MockProvider);

    setSource("   ");
    expect(getProvider(Platform.META)).toBeInstanceOf(MockProvider);
  });

  it("repassa a plataforma pedida para o mock", () => {
    setSource("mock");

    expect(getProvider(Platform.GOOGLE).platform).toBe(Platform.GOOGLE);
    expect(getProvider(Platform.META).platform).toBe(Platform.META);
  });

  it("devolve MetaProvider para META quando DATA_PROVIDER e live", async () => {
    setSource("live");
    const provider = getProvider(Platform.META);

    expect(provider).toBeInstanceOf(MetaProvider);
    expect(provider.platform).toBe(Platform.META);
    await expect(provider.getAccount("act_100000042")).rejects.toBeInstanceOf(NotImplementedError);
    await expect(provider.listCampaigns("act_100000042")).rejects.toBeInstanceOf(
      NotImplementedError,
    );
    await expect(
      provider.fetchInsights({
        accountExternalId: "act_100000042",
        since: "2026-07-01",
        until: "2026-07-07",
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  // Mock por omissao em producao serviria spend e ROAS inventados como se fossem
  // do anunciante. Melhor nao subir.
  it("exige DATA_PROVIDER em producao", () => {
    setSource(undefined);
    setNodeEnv("production");

    expect(() => getProvider(Platform.META)).toThrow(ProviderConfigError);

    setSource("live");
    expect(getProvider(Platform.META)).toBeInstanceOf(MetaProvider);
  });

  it("mantem o mock como padrao fora de producao", () => {
    setSource(undefined);

    for (const env of ["development", "test"]) {
      setNodeEnv(env);
      expect(getProvider(Platform.META)).toBeInstanceOf(MockProvider);
    }
  });

  it("recusa GOOGLE em live, que ainda nao tem implementacao", () => {
    setSource("live");

    expect(() => getProvider(Platform.GOOGLE)).toThrow(ProviderConfigError);
  });

  // Valor errado nao pode cair no mock em silencio: producao serviria dado falso.
  it("derruba na hora com DATA_PROVIDER desconhecido", () => {
    setSource("meta");

    expect(() => getProvider(Platform.META)).toThrow(ProviderConfigError);
  });
});

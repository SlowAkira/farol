import { Platform } from "@/generated/prisma/enums";
import { ProviderConfigError } from "./errors";
import { MetaProvider } from "./meta";
import { MockProvider } from "./mock";
import type { AdsProvider } from "./types";

export type {
  AdsProvider,
  FetchInsightsParams,
  ProviderAccount,
  ProviderCampaign,
  ProviderInsight,
} from "./types";
export {
  InvalidDateRangeError,
  NotImplementedError,
  ProviderConfigError,
  ProviderError,
  TransientProviderError,
  UnknownAccountError,
} from "./errors";

function liveProvider(platform: Platform): AdsProvider {
  switch (platform) {
    case Platform.META:
      return new MetaProvider();
    case Platform.GOOGLE:
      throw new ProviderConfigError(
        "Nao existe provedor real para GOOGLE ainda; use DATA_PROVIDER=mock.",
      );
  }
}

// Em producao o mock nao pode ser default: servir spend e ROAS inventados como se
// fossem reais e pior do que nao subir. Fora de producao o default segue valendo.
function resolveSource(): string {
  const configured = process.env.DATA_PROVIDER?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    throw new ProviderConfigError(
      'DATA_PROVIDER e obrigatorio em producao. Defina "live" para usar a plataforma ou "mock" para assumir dado falso.',
    );
  }

  return "mock";
}

// process.env lido aqui dentro, e nao no topo do modulo: no topo o valor seria
// congelado no `next build` em vez de valer o que estiver no ambiente de execucao.
export function getProvider(platform: Platform): AdsProvider {
  const source = resolveSource();

  switch (source) {
    case "mock":
      return new MockProvider({ platform });
    case "live":
      return liveProvider(platform);
    default:
      throw new ProviderConfigError(
        `DATA_PROVIDER invalido: "${source}". Valores aceitos: "mock" ou "live".`,
      );
  }
}

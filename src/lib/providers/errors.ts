export abstract class ProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

// A unica classe que o retry deve capturar. Tudo mais e erro de configuracao ou
// de programacao, e repetir a chamada so atrasa o diagnostico.
export class TransientProviderError extends ProviderError {}

export class UnknownAccountError extends ProviderError {
  constructor(accountExternalId: string) {
    super(`Conta desconhecida: "${accountExternalId}".`);
  }
}

export class InvalidDateRangeError extends ProviderError {
  constructor(field: "since" | "until", value: string) {
    super(`"${field}" deve estar no formato YYYY-MM-DD, recebido: "${value}".`);
  }
}

export class NotImplementedError extends ProviderError {}

export class ProviderConfigError extends ProviderError {}

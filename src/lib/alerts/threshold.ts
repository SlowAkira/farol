import type { AlertComparison, AlertDirection, AlertMetric } from "@/generated/prisma/enums";
import { formatCurrency, formatPercent, formatRatio } from "@/lib/format";
import { alertMetricDefinition, thresholdToValue, valueToThreshold } from "./metrics";

// O `threshold` de uma regra e um Int cuja unidade depende da metrica e da
// comparacao (o mapa em ./metrics.ts). Este arquivo e a outra ponta da mesma
// verdade: como aquele inteiro vira o texto que a pessoa digita, e de volta.
// Fica separado do mapa porque a pergunta e outra -- la e "por quanto o motor
// multiplica", aqui e "o que aparece no campo" -- e porque so aqui entra locale.

// Nunca "count": as seis metricas de alerta sao tres dinheiros, duas razoes e um
// percentual. O caminho de contagem existe so para nao compilar em silencio se
// alguem acrescentar uma metrica que some coisas.
export type ThresholdUnit = "currency" | "ratio" | "percent";

// Precisao que o inteiro guarda: centavos em dinheiro, centesimos em razao e
// percentual, centesimos de ponto percentual em variacao. Duas casas em todos os
// casos -- a terceira nao caberia no inteiro, entao e erro, e nao arredondamento
// silencioso de um limiar que a pessoa escreveu de proposito.
const CASAS_DECIMAIS = 2;
// Int do Postgres vai ate 2.147.483.647. O teto e folgado para qualquer limiar
// real (R$ 10 milhoes) e apertado o bastante para o valor escalado nunca
// estourar a coluna.
const THRESHOLD_MAXIMO = 1_000_000_000;
// Cair mais que 100% e cair abaixo de zero, que nenhuma das seis metricas faz.
const QUEDA_TOTAL = 100 * 100;

export function thresholdUnit(metric: AlertMetric, comparison: AlertComparison): ThresholdUnit {
  // Variacao percentual e percentual seja qual for a metrica que variou: "CPA
  // subiu 30%" e "ROAS caiu 30%" se digitam do mesmo jeito.
  if (comparison === "PCT_CHANGE") {
    return "percent";
  }

  const { unit } = alertMetricDefinition(metric);
  if (unit === "count") {
    throw new Error(`Metrica de alerta ${metric} nao deveria ter unidade de contagem.`);
  }

  return unit;
}

export type ThresholdAffix = {
  readonly prefix: string | null;
  readonly suffix: string | null;
};

// O simbolo fica fora do campo, ancorado na borda, e nao dentro do valor
// digitado: o que a pessoa apaga e sempre so o numero, e o campo nunca exige que
// ela lembre de escrever "R$".
export function thresholdAffix(unit: ThresholdUnit, currency: string): ThresholdAffix {
  switch (unit) {
    case "currency":
      // O simbolo sai do Intl da moeda da conta: conta em USD mostra "US$", nao
      // um "R$" gravado no codigo.
      return { prefix: simboloDaMoeda(currency), suffix: null };
    case "ratio":
      return { prefix: null, suffix: "×" };
    case "percent":
      return { prefix: null, suffix: "%" };
  }
}

function simboloDaMoeda(currency: string): string {
  // formatCurrency(0) devolve "R$ 0,00"; o que sobra ao tirar digitos,
  // separadores e espaco (inclusive o NBSP que o ICU usa) e o simbolo.
  return formatCurrency(0, currency).replace(/[\d.,\s ]/g, "");
}

// Valor na unidade em que a pessoa escreve: reais (nao centavos), multiplo,
// pontos percentuais. E o `thresholdToValue` do motor com o passo de centavos
// desfeito -- so em dinheiro o inteiro guardado ja e uma subunidade.
function thresholdParaCampo(
  metric: AlertMetric,
  comparison: AlertComparison,
  threshold: number,
): number {
  const valor = thresholdToValue(metric, comparison, threshold);
  return thresholdUnit(metric, comparison) === "currency" ? valor / 100 : valor;
}

function campoParaThreshold(
  metric: AlertMetric,
  comparison: AlertComparison,
  valorDoCampo: number,
): number {
  const unit = thresholdUnit(metric, comparison);
  const naUnidadeDaMetrica = unit === "currency" ? valorDoCampo * 100 : valorDoCampo;
  return valueToThreshold(metric, comparison, naUnidadeDaMetrica);
}

// So o numero, sem simbolo: e o que vai no `value` do input. Sempre com as duas
// casas, porque um campo que mostra "45" e guarda 4500 deixa duvida sobre o que
// exatamente esta guardado.
export function formatThresholdInput(
  metric: AlertMetric,
  comparison: AlertComparison,
  threshold: number,
): string {
  return thresholdParaCampo(metric, comparison, threshold).toLocaleString("pt-BR", {
    minimumFractionDigits: CASAS_DECIMAIS,
    maximumFractionDigits: CASAS_DECIMAIS,
  });
}

// Com simbolo, para o limiar aparecer em prosa ("acima do limite de R$ 60,00").
export function formatThresholdValue(
  metric: AlertMetric,
  comparison: AlertComparison,
  threshold: number,
  currency: string,
): string {
  switch (thresholdUnit(metric, comparison)) {
    case "currency":
      // formatCurrency ja recebe centavos e divide por 100 -- aqui entra o valor
      // na unidade da metrica, nao o do campo.
      return formatCurrency(thresholdToValue(metric, comparison, threshold), currency);
    case "ratio":
      return formatRatio(thresholdParaCampo(metric, comparison, threshold), CASAS_DECIMAIS);
    case "percent":
      return formatPercent(thresholdParaCampo(metric, comparison, threshold), CASAS_DECIMAIS);
  }
}

export type ThresholdErrorCode =
  | "VAZIO"
  | "NAO_E_NUMERO"
  | "CASAS_DEMAIS"
  | "NAO_POSITIVO"
  | "ALTO_DEMAIS"
  | "QUEDA_IMPOSSIVEL";

export type ThresholdError = {
  readonly code: ThresholdErrorCode;
  readonly message: string;
};

export type ThresholdParse =
  | { readonly ok: true; readonly threshold: number }
  | { readonly ok: false; readonly error: ThresholdError };

const MENSAGEM: Record<ThresholdErrorCode, string> = {
  VAZIO: "Informe o limiar da regra.",
  NAO_E_NUMERO: "Escreva só o número, com vírgula nos decimais. Exemplo: 45,00.",
  CASAS_DEMAIS: "O limiar guarda no máximo duas casas decimais.",
  NAO_POSITIVO: "O limiar precisa ser maior que zero.",
  ALTO_DEMAIS: "Esse limiar é alto demais para virar uma regra útil.",
  QUEDA_IMPOSSIVEL: "Nenhuma métrica cai mais que 100%: essa regra nunca dispararia.",
};

function erro(code: ThresholdErrorCode): ThresholdParse {
  return { ok: false, error: { code, message: MENSAGEM[code] } };
}

// Virgula decide os decimais, ponto separa milhar -- as duas regras do pt-BR, e
// nenhuma tentativa de adivinhar a outra convencao. "45.00" nao vira 45: vira
// erro que ensina, porque ler aquilo como 45 e ler como 4500 sao ambos
// defensaveis e escolher errado custa uma regra disparando cem vezes por dia.
const COM_MILHAR = /^\d{1,3}(\.\d{3})+(,\d+)?$/;
const SEM_MILHAR = /^\d+(,\d+)?$/;

type LeituraDecimal =
  | { readonly ok: true; readonly valor: number }
  | { readonly ok: false; readonly code: ThresholdErrorCode };

function lerDecimal(texto: string): LeituraDecimal {
  // Vazio se decide antes de limpar simbolo: depois da limpeza "quarenta"
  // tambem vira string vazia, e as duas coisas pedem mensagens diferentes --
  // uma pede que preencha, a outra ensina o formato.
  const semEspaco = texto.replace(/[\s ]/g, "");
  if (semEspaco === "") {
    return { ok: false, code: "VAZIO" };
  }

  // Tira os simbolos que o proprio campo ja mostra na borda: colar "R$ 45,00"
  // ou "2,5x" copiado de outro lugar funciona.
  const limpo = semEspaco.replace(/^[^\d]+/, "").replace(/[%×x]$/i, "");

  if (limpo === "" || (!COM_MILHAR.test(limpo) && !SEM_MILHAR.test(limpo))) {
    return { ok: false, code: "NAO_E_NUMERO" };
  }

  const [inteiro, decimais = ""] = limpo.replace(/\./g, "").split(",");
  if (decimais.length > CASAS_DECIMAIS) {
    return { ok: false, code: "CASAS_DEMAIS" };
  }

  return { ok: true, valor: Number(`${inteiro}.${decimais.padEnd(CASAS_DECIMAIS, "0")}`) };
}

// Texto do campo -> inteiro que vai para o banco. Erro de dominio como valor de
// retorno (CLAUDE.md): o formulario mostra a mensagem no campo, e nada aqui
// lanca.
export function parseThresholdInput(
  metric: AlertMetric,
  comparison: AlertComparison,
  direction: AlertDirection,
  texto: string,
): ThresholdParse {
  const lido = lerDecimal(texto);
  if (!lido.ok) {
    return erro(lido.code);
  }

  const threshold = campoParaThreshold(metric, comparison, lido.valor);

  // O limiar e sempre magnitude positiva; quem da sinal a ela e a direcao. Zero
  // e um limiar que qualquer numero cruza, ou seja, uma regra que dispara sempre.
  if (threshold <= 0) {
    return erro("NAO_POSITIVO");
  }
  if (threshold > THRESHOLD_MAXIMO) {
    return erro("ALTO_DEMAIS");
  }
  if (comparison === "PCT_CHANGE" && direction === "BELOW" && threshold >= QUEDA_TOTAL) {
    return erro("QUEDA_IMPOSSIVEL");
  }

  return { ok: true, threshold };
}

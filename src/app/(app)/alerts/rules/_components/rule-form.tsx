"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AlertComparison, AlertMetric } from "@/generated/prisma/enums";
import type { RuleConditionValues, RuleFormErrors, RuleFormValues } from "@/lib/alerts/form";
import {
  alertDirectionOptions,
  ALERT_COMPARISON_OPTIONS,
  ALERT_METRIC_OPTIONS,
  ALERT_SCOPE_OPTIONS,
  ALERT_WINDOW_OPTIONS,
} from "@/lib/alerts/labels";
import type { BacktestPreview } from "@/lib/alerts/preview-result";
import { thresholdAffix, thresholdUnit } from "@/lib/alerts/threshold";
import { previewRule, removeRule, saveRule } from "../actions";
import { BacktestPanel, type BacktestPanelState } from "./backtest-panel";

// Quanto o preview espera antes de sair do lugar. Meio segundo e o tempo entre
// duas teclas de quem digita um limiar; menos que isso dispararia uma simulacao
// de 90 dias por caractere.
const ATRASO_DO_PREVIEW = 500;

function Campo({
  label,
  htmlFor,
  erro,
  ajuda,
  children,
}: {
  label: string;
  htmlFor: string;
  erro?: string;
  ajuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-label font-medium text-foreground">
        {label}
      </label>
      {children}
      {/* Ajuda antes do erro e nunca no lugar dele: a explicacao do campo
          continua valendo depois que a pessoa erra o formato. */}
      {ajuda ? <p className="text-label text-muted-foreground">{ajuda}</p> : null}
      {erro ? (
        <p role="alert" className="text-label text-alert-critical">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

function Escolha<T extends string>({
  id,
  value,
  onChange,
  options,
  invalido,
}: {
  id: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { readonly value: T; readonly label: string }[];
  invalido: boolean;
}) {
  return (
    <Select value={value} onValueChange={(proximo) => onChange(proximo as T)}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalido}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function RuleForm({
  adAccountId,
  currency,
  ruleId,
  valoresIniciais,
  previewInicial,
  readOnlyMessage,
  voltarPara,
}: {
  adAccountId: string;
  currency: string;
  // null e regra nova; com id o formulario edita a existente.
  ruleId: string | null;
  valoresIniciais: RuleFormValues;
  // Simulacao ja calculada no servidor para a configuracao inicial: sem ela a
  // tela abriria com esqueleto e uma ida ao servidor para dizer o que ja se
  // sabia antes de renderizar.
  previewInicial: BacktestPreview | null;
  readOnlyMessage: string | null;
  voltarPara: string;
}) {
  const router = useRouter();
  const campo = useId();
  const [values, setValues] = useState<RuleFormValues>(valoresIniciais);
  const [errors, setErrors] = useState<RuleFormErrors>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [tocado, setTocado] = useState(false);
  const [preview, setPreview] = useState<BacktestPanelState>(
    previewInicial === null ? { kind: "carregando" } : { kind: "pronto", preview: previewInicial },
  );

  // Somente leitura bloqueia gravar, e nao configurar: o preview e uma leitura,
  // e e o que a tela tem de melhor a mostrar. Travar os campos na conta demo
  // esconderia justamente o diferencial atras de um cadeado.
  const bloqueado = readOnlyMessage !== null;
  const affix = thresholdAffix(
    thresholdUnit(values.metric as AlertMetric, values.comparison as AlertComparison),
    currency,
  );

  // Tudo que decide o disparo, sem o nome: e o que o preview simula, e e o que
  // decide quando ele roda de novo. Digitar o nome nao muda simulacao nenhuma, e
  // sem esta separacao cada tecla do nome custaria um backtest de 90 dias.
  const condicao = useMemo<RuleConditionValues>(
    () => ({
      metric: values.metric,
      comparison: values.comparison,
      direction: values.direction,
      scope: values.scope,
      threshold: values.threshold,
      windowDays: values.windowDays,
    }),
    [
      values.metric,
      values.comparison,
      values.direction,
      values.scope,
      values.threshold,
      values.windowDays,
    ],
  );

  function mudarNome(name: string): void {
    setValues((atual) => ({ ...atual, name }));
  }

  function mudar(patch: Partial<RuleConditionValues>): void {
    setTocado(true);
    setValues((atual) => ({ ...atual, ...patch }));
  }

  // Trocar a comparacao troca o significado da direcao e a unidade do limiar, e
  // por isso ela reseta o erro do limiar: "45,00" era reais e passou a ser 45%,
  // e a mensagem antiga falaria de um campo que ja mudou de assunto.
  function mudarComparacao(comparison: string): void {
    mudar({ comparison });
    setErrors((atuais) => ({ ...atuais, threshold: undefined, direction: undefined }));
  }

  useEffect(() => {
    // Nada mudou desde o render do servidor: a simulacao que esta na tela ja e
    // desta configuracao.
    if (!tocado && previewInicial !== null) {
      return;
    }

    let atual = true;
    setPreview({ kind: "carregando" });

    const timer = setTimeout(() => {
      void previewRule(adAccountId, condicao).then((resultado) => {
        // A resposta que chega depois de a pessoa ter digitado de novo descreve
        // uma regra que nao esta mais na tela.
        if (!atual) {
          return;
        }

        // Os erros de condicao sao substituidos inteiros a cada resposta, e nao
        // acumulados: o preview acabou de julgar todos eles de uma vez, e manter
        // o erro anterior deixaria "45.00" reclamando do formato depois de a
        // pessoa ja ter corrigido para "45,00". O erro de nome sobrevive porque
        // e a unica coisa que o preview nao olha.
        setErrors((anteriores) => ({
          name: anteriores.name,
          ...(resultado.ok ? {} : resultado.errors),
        }));

        if (resultado.ok) {
          setPreview({ kind: "pronto", preview: resultado.preview });
          return;
        }

        setPreview(
          resultado.message === null
            ? { kind: "invalido" }
            : { kind: "erro", message: resultado.message },
        );
      });
    }, ATRASO_DO_PREVIEW);

    return () => {
      atual = false;
      clearTimeout(timer);
    };
  }, [adAccountId, condicao, tocado, previewInicial]);

  function enviar(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    setSalvando(true);
    setMensagem(null);

    void saveRule(adAccountId, ruleId, values).then((resultado) => {
      if (resultado.ok) {
        // refresh antes do push: a lista e um Server Component e sem isto a
        // regra recem-salva apareceria so no proximo carregamento inteiro.
        router.refresh();
        router.push(voltarPara);
        return;
      }

      setSalvando(false);
      setErrors(resultado.errors);
      setMensagem(resultado.message);
    });
  }

  function excluir(): void {
    if (ruleId === null) {
      return;
    }

    setSalvando(true);
    setMensagem(null);

    void removeRule(ruleId).then((resultado) => {
      if (resultado.ok) {
        router.refresh();
        router.push(voltarPara);
        return;
      }

      setSalvando(false);
      setConfirmandoExclusao(false);
      setMensagem(resultado.message);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lead">Configuração</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <Campo label="Nome da regra" htmlFor={`${campo}-nome`} erro={errors.name}>
              <Input
                id={`${campo}-nome`}
                value={values.name}
                onChange={(evento) => mudarNome(evento.target.value)}
                placeholder="CPA subindo nas campanhas de captação"
                aria-invalid={errors.name !== undefined}
              />
            </Campo>
          </div>

          <Campo label="Métrica" htmlFor={`${campo}-metrica`} erro={errors.metric}>
            <Escolha
              id={`${campo}-metrica`}
              value={values.metric}
              onChange={(metric) => mudar({ metric })}
              options={ALERT_METRIC_OPTIONS}
              invalido={errors.metric !== undefined}
            />
          </Campo>

          <Campo label="Comparação" htmlFor={`${campo}-comparacao`} erro={errors.comparison}>
            <Escolha
              id={`${campo}-comparacao`}
              value={values.comparison}
              onChange={mudarComparacao}
              options={ALERT_COMPARISON_OPTIONS}
              invalido={errors.comparison !== undefined}
            />
          </Campo>

          <Campo label="Dispara quando" htmlFor={`${campo}-direcao`} erro={errors.direction}>
            <Escolha
              id={`${campo}-direcao`}
              value={values.direction}
              onChange={(direction) => mudar({ direction })}
              options={alertDirectionOptions(values.comparison as AlertComparison)}
              invalido={errors.direction !== undefined}
            />
          </Campo>

          <Campo
            label="Limiar"
            htmlFor={`${campo}-limiar`}
            erro={errors.threshold}
            ajuda="Vírgula nos decimais, ponto no milhar. Exemplo: 1.250,00."
          >
            {/* O simbolo mora na borda do campo, e nao dentro do valor: o que a
                pessoa digita e apaga e sempre so o numero. */}
            <div className="relative">
              {affix.prefix ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-muted-foreground"
                >
                  {affix.prefix}
                </span>
              ) : null}
              <Input
                id={`${campo}-limiar`}
                value={values.threshold}
                onChange={(evento) => mudar({ threshold: evento.target.value })}
                inputMode="decimal"
                autoComplete="off"
                className={cnLimiar(affix)}
                aria-invalid={errors.threshold !== undefined}
              />
              {affix.suffix ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-muted-foreground"
                >
                  {affix.suffix}
                </span>
              ) : null}
            </div>
          </Campo>

          <Campo label="Avaliar" htmlFor={`${campo}-escopo`} erro={errors.scope}>
            <Escolha
              id={`${campo}-escopo`}
              value={values.scope}
              onChange={(scope) => mudar({ scope })}
              options={ALERT_SCOPE_OPTIONS}
              invalido={errors.scope !== undefined}
            />
          </Campo>

          <Campo
            label="Janela"
            htmlFor={`${campo}-janela`}
            erro={errors.windowDays}
            ajuda="Janela curta reage rápido e oscila mais; janela longa é estável e demora a avisar."
          >
            <Escolha
              id={`${campo}-janela`}
              value={values.windowDays}
              onChange={(windowDays) => mudar({ windowDays })}
              options={ALERT_WINDOW_OPTIONS.map((dias) => ({
                value: String(dias),
                label: `${dias} dias`,
              }))}
              invalido={errors.windowDays !== undefined}
            />
          </Campo>
        </CardContent>
      </Card>

      <BacktestPanel state={preview} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={bloqueado || salvando}>
            {ruleId === null ? "Criar regra" : "Salvar alterações"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push(voltarPara)}>
            Cancelar
          </Button>

          {ruleId === null ? null : (
            <div className="ms-auto flex flex-wrap items-center gap-2">
              {confirmandoExclusao ? (
                <>
                  {/* Confirmacao inline, e nao um dialogo: excluir regra apaga os
                      alertas dela em cascata, e a frase precisa estar visivel na
                      mesma tela em que o botao esta. */}
                  <span className="text-label text-muted-foreground">
                    Excluir apaga também os alertas já disparados por ela.
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmandoExclusao(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="button" variant="destructive" disabled={salvando} onClick={excluir}>
                    Confirmar exclusão
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  disabled={bloqueado || salvando}
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Excluir regra
                </Button>
              )}
            </div>
          )}
        </div>

        {bloqueado ? <p className="text-label text-muted-foreground">{readOnlyMessage}</p> : null}
        {mensagem ? (
          <p role="status" className="text-label text-muted-foreground">
            {mensagem}
          </p>
        ) : null}
      </div>
    </form>
  );
}

// O padding do campo abre espaco para o simbolo que estiver na borda: sem isto o
// numero digitado passaria por baixo do "R$".
function cnLimiar(affix: { prefix: string | null; suffix: string | null }): string {
  return [affix.prefix ? "ps-10" : "", affix.suffix ? "pe-8" : ""].filter(Boolean).join(" ");
}

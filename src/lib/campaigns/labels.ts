import type { CampaignObjective, CampaignStatus } from "@/generated/prisma/enums";

// Mesmo papel do catalogo de metricas, para o vocabulario da campanha: o enum do
// Prisma e ingles e maiusculo porque e contrato de banco, e a tela e portugues.
// A traducao fica aqui, uma vez, e nao em cada pagina que mostra uma campanha --
// duas copias viram dois vocabularios no primeiro rotulo que alguem ajustar.
export const OBJECTIVE_LABEL = {
  CONVERSIONS: "Conversões",
  TRAFFIC: "Tráfego",
  AWARENESS: "Reconhecimento",
  LEADS: "Leads",
} as const satisfies Record<CampaignObjective, string>;

export const STATUS_LABEL = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  ARCHIVED: "Arquivada",
  DELETED: "Excluída",
} as const satisfies Record<CampaignStatus, string>;

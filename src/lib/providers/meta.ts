/**
 * Esqueleto do provedor da Meta. Implementacao na fase 9.
 *
 * Endpoints da Graph API que serao usados (a versao `{v}` deve ser escolhida e
 * fixada no momento da implementacao, nunca deixada implicita):
 *
 * - GET  /{v}/{ad-account-id}/campaigns
 *     fields=id,name,objective,status,effective_status,daily_budget
 *     paginacao por cursor em `paging.cursors.after`
 * - GET  /{v}/{ad-account-id}/insights
 *     level=campaign, time_increment=1, time_range={"since","until"}
 *     fields=campaign_id,date_start,impressions,clicks,spend,reach,actions,action_values
 * - POST /{v}/{ad-account-id}/insights -> report_run_id
 *     depois poll em GET /{v}/{report_run_id} ate async_status="Job Completed";
 *     obrigatorio para janelas longas, que estouram o limite da chamada sincrona
 * - GET  /{v}/me/adaccounts
 *     fields=id,name,currency,timezone_name,account_status; usado ao conectar a conta
 * - GET  /{v}/act_{id}
 *     fields=name,currency,timezone_name,account_status; alimenta getAccount.
 *     `account_status` e numerico (1=ACTIVE, 2=DISABLED, 3=UNSETTLED, 101=CLOSED)
 *     e precisa virar os 3 valores de AccountStatus
 * - GET  /{v}/oauth/access_token?grant_type=fb_exchange_token
 *     troca o token curto pelo de longa duracao
 *
 * Onde o mock mente, e que precisa ser resolvido aqui:
 *
 * - Dia sem entrega nao volta linha nenhuma na API real; o MockProvider devolve
 *   uma linha zerada. Quem consome nao pode assumir serie contigua: ou a ingestao
 *   preenche o buraco com zero, ou as metricas toleram falta de dia. Decidir antes
 *   de escrever a fase 9.
 * - Insight muda depois de coletado: a janela de atribuicao continua enchendo por
 *   ~28 dias. Reingerir o periodo recente e fazer upsert, nunca append. E para isso
 *   que existe o @@unique([campaignId, date]).
 * - `CampaignObjective` tem 4 valores e os objetivos ODAX da Meta sao mais
 *   (ENGAGEMENT e APP_PROMOTION nao tem para onde ir), alem dos legados
 *   LINK_CLICKS/LEAD_GENERATION/BRAND_AWARENESS. Ou entra um OTHER via migracao,
 *   ou o mapeamento e assumidamente com perda e documentado.
 *
 * Armadilhas de conversao ja mapeadas:
 *
 * - `spend` e `action_values` chegam como string decimal na moeda da conta.
 *   Converter fatiando a string no ponto, nao com Math.round(Number(s) * 100):
 *   multiplicar dinheiro por float e exatamente o que o projeto proibe.
 * - "Centavos" so vale para moeda de 2 casas. JPY e KRW tem 0, KWD e BHD tem 3.
 *   O campo e unidade menor da moeda da conta, e sem a moeda junto nao significa
 *   nada.
 * - `daily_budget` ja vem em unidade menor, mas ainda como string.
 * - `impressions`, `clicks` e `reach` tambem chegam como string, nao numero.
 * - Conversoes nao sao campo de topo: saem do array `actions`, filtrando por
 *   `action_type`. `omni_purchase` ja vem deduplicado; `purchase` puro conta
 *   duas vezes. Fixar `action_attribution_windows` explicitamente, senao o numero
 *   nao bate com o que o cliente ve no Ads Manager.
 * - `date_start` ja e YYYY-MM-DD no fuso da conta, que e exatamente o formato
 *   que o resto do sistema espera. Guardar como veio, nunca reparsear.
 * - `frequency` e `ctr` vem calculados pela Meta e devem ser ignorados: metrica
 *   derivada so existe em src/lib/metrics. E `reach` nao e somavel entre dias:
 *   alcance do periodo nao e a soma dos alcances diarios.
 * - Campanha arquivada ou deletada fica fora por padrao; precisa de `filtering`
 *   sobre effective_status para aparecer.
 * - Seguir `paging.next` ate o fim; cursor expira.
 * - Consumo de cota vem no header `X-Business-Use-Case-Usage`. Rate limit vira
 *   TransientProviderError; ja o codigo 190 (token expirado) nao e transitorio,
 *   e caso de reconectar a conta e nao pode entrar no retry.
 */
import { Platform } from "@/generated/prisma/enums";
import { NotImplementedError } from "./errors";
import type {
  AdsProvider,
  FetchInsightsParams,
  ProviderAccount,
  ProviderCampaign,
  ProviderInsight,
} from "./types";

export class MetaProvider implements AdsProvider {
  readonly platform: Platform = Platform.META;

  async getAccount(accountExternalId: string): Promise<ProviderAccount> {
    throw new NotImplementedError(`MetaProvider.getAccount("${accountExternalId}") chega na fase 9.`);
  }

  async listCampaigns(accountExternalId: string): Promise<ProviderCampaign[]> {
    throw new NotImplementedError(
      `MetaProvider.listCampaigns("${accountExternalId}") chega na fase 9.`,
    );
  }

  async fetchInsights({
    accountExternalId,
    since,
    until,
  }: FetchInsightsParams): Promise<ProviderInsight[]> {
    throw new NotImplementedError(
      `MetaProvider.fetchInsights("${accountExternalId}", ${since}..${until}) chega na fase 9.`,
    );
  }
}

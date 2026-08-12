-- CreateEnum
CREATE TYPE "AlertDirection" AS ENUM ('ABOVE', 'BELOW');

-- CreateEnum
CREATE TYPE "AlertScope" AS ENUM ('ACCOUNT', 'CAMPAIGN');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'RESOLVED', 'MUTED');

-- AlterEnum
ALTER TYPE "AlertMetric" ADD VALUE 'FREQUENCY';

-- AlterTable
-- As tres colunas obrigatorias entram anulaveis de proposito: as regras que ja
-- existem precisam ser convertidas linha a linha antes do NOT NULL, e o
-- ADD COLUMN ... NOT NULL que o `migrate diff` gera falharia com elas na tabela.
ALTER TABLE "AlertRule" ADD COLUMN     "direction" "AlertDirection",
ADD COLUMN     "scope" "AlertScope",
ADD COLUMN     "threshold" INTEGER,
ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;

-- O eixo do `comparison` antigo era a direcao, e nao o tipo de comparacao: as
-- duas variantes mediam variacao percentual, uma para cima e outra para baixo.
UPDATE "AlertRule" SET "direction" = CASE "comparison"::text
    WHEN 'INCREASE_PCT' THEN 'ABOVE'::"AlertDirection"
    ELSE 'BELOW'::"AlertDirection"
END;

-- Regra presa a uma campanha vira regra de escopo de campanha -- que agora
-- avalia todas as campanhas da conta, uma a uma, em vez de uma so.
UPDATE "AlertRule" SET "scope" = CASE
    WHEN "campaignId" IS NULL THEN 'ACCOUNT'::"AlertScope"
    ELSE 'CAMPAIGN'::"AlertScope"
END;

-- thresholdPct era ponto percentual inteiro; threshold e centesimo de ponto
-- percentual (30% -> 3000), a escala que src/lib/alerts/metrics.ts define para
-- PCT_CHANGE e que vale para qualquer metrica.
UPDATE "AlertRule" SET "threshold" = "thresholdPct" * 100;

-- AlterTable
ALTER TABLE "AlertRule" ALTER COLUMN "direction" SET NOT NULL,
ALTER COLUMN "scope" SET NOT NULL,
ALTER COLUMN "threshold" SET NOT NULL;

-- AlterEnum
-- Toda regra existente era variacao percentual, entao o USING nao precisa olhar
-- o valor antigo: a direcao ja saiu dele na coluna `direction` acima.
CREATE TYPE "AlertComparison_new" AS ENUM ('PCT_CHANGE', 'ABSOLUTE_THRESHOLD');
ALTER TABLE "AlertRule" ALTER COLUMN "comparison" TYPE "AlertComparison_new" USING ('PCT_CHANGE'::"AlertComparison_new");
ALTER TYPE "AlertComparison" RENAME TO "AlertComparison_old";
ALTER TYPE "AlertComparison_new" RENAME TO "AlertComparison";
-- Sem o "public". que o `migrate diff` gera aqui: os testes replayam este arquivo
-- dentro do schema por worker (src/test/db.ts) e o tipo antigo nao esta no
-- public, entao a forma qualificada derruba o replay inteiro.
DROP TYPE "AlertComparison_old";

-- DropForeignKey
ALTER TABLE "AlertRule" DROP CONSTRAINT "AlertRule_campaignId_fkey";

-- AlterTable
ALTER TABLE "AlertRule" DROP COLUMN "campaignId",
DROP COLUMN "thresholdPct";

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "campaignId" TEXT,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fingerprint" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "context" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_fingerprint_status_idx" ON "Alert"("fingerprint", "status");

-- CreateIndex
CREATE INDEX "Alert_ruleId_status_idx" ON "Alert"("ruleId", "status");

-- CreateIndex
CREATE INDEX "AlertRule_adAccountId_enabled_idx" ON "AlertRule"("adAccountId", "enabled");

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DropIndex
DROP INDEX "Campaign_adAccountId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_adAccountId_externalId_key" ON "Campaign"("adAccountId", "externalId");

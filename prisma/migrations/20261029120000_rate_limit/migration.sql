-- Shared fixed-window rate-limit counters (one row per key), used by the
-- public checkout endpoint. Additive only: creates one new table, no changes
-- to existing tables or data.

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex (lets stale windows be purged cheaply)
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

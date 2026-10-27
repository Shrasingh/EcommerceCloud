-- Durable, reviewable record of paid Stripe sessions that don't reconcile with
-- their order. Additive only: creates one new table, no changes to existing
-- tables or data.

-- CreateTable
CREATE TABLE "PaymentException" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentException_eventId_key" ON "PaymentException"("eventId");

-- CreateIndex
CREATE INDEX "PaymentException_orderId_idx" ON "PaymentException"("orderId");

-- CreateIndex
CREATE INDEX "PaymentException_resolved_idx" ON "PaymentException"("resolved");

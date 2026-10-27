-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "stripeSessionId" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "currency" VARCHAR(3),
ADD COLUMN     "unitPrice" DECIMAL(12,2);

-- CreateIndex
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");

-- ---------------------------------------------------------------------------
-- Hand-written (Prisma cannot express CHECK constraints).
-- A price is recorded together with its currency, or not at all. Existing rows
-- have both columns NULL, so they satisfy these constraints without a backfill.
-- ---------------------------------------------------------------------------
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_unitPrice_currency_together"
  CHECK (("unitPrice" IS NULL) = ("currency" IS NULL));

ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_currency_iso_lowercase"
  CHECK ("currency" IS NULL OR "currency" ~ '^[a-z]{3}$');

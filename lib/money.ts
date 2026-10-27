import { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string;

/** The only currency checkout charges in today. */
export const CHECKOUT_CURRENCY = "usd";

// Decimal places of each supported currency's minor unit (cents for USD).
// Stripe amounts are integers in these minor units.
const MINOR_UNIT_DIGITS: Record<string, number> = { usd: 2 };

// Smallest amount Stripe will accept for a charge, in each currency's minor
// units. Stripe rejects totals below this (~$0.50 for USD); validating it up
// front lets us return a clear client error instead of a generic 500.
const MIN_CHARGE_MINOR_UNITS: Record<string, number> = { usd: 50 };

export function minorUnitDigits(currency: string): number {
  const digits = MINOR_UNIT_DIGITS[currency.toLowerCase()];
  if (digits === undefined) throw new Error(`Unsupported currency "${currency}"`);
  return digits;
}

export function minChargeMinorUnits(currency: string = CHECKOUT_CURRENCY): number {
  const min = MIN_CHARGE_MINOR_UNITS[currency.toLowerCase()];
  if (min === undefined) throw new Error(`Unsupported currency "${currency}"`);
  return min;
}

/** Formats a minor-unit amount for a client-facing message, e.g. 50 -> "0.50". */
export function formatMinorUnits(minor: number, currency: string = CHECKOUT_CURRENCY): string {
  return fromMinorUnits(minor, currency).toFixed(minorUnitDigits(currency));
}

/**
 * Converts a price to Stripe's integer minor units using exact decimal
 * arithmetic, rounding half up (1.005 -> 101). Avoids float errors such as
 * 1.005 * 100 = 100.49999999999999, which Math.round turns into 100.
 */
export function toMinorUnits(amount: DecimalLike, currency: string = CHECKOUT_CURRENCY): number {
  const value = new Prisma.Decimal(amount)
    .mul(new Prisma.Decimal(10).pow(minorUnitDigits(currency)))
    .toDecimalPlaces(0, Prisma.Decimal.ROUND_HALF_UP);
  if (!value.isFinite() || value.isNegative()) {
    throw new Error(`Invalid amount ${amount.toString()}`);
  }
  if (value.gt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount too large");
  return value.toNumber();
}

/** Inverse of toMinorUnits: exact decimal major-unit amount (2000 -> 20.00). */
export function fromMinorUnits(minor: number, currency: string = CHECKOUT_CURRENCY): Prisma.Decimal {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error(`Invalid minor amount ${minor}`);
  return new Prisma.Decimal(minor).div(new Prisma.Decimal(10).pow(minorUnitDigits(currency)));
}

interface AddressLike {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

/** Formats a Stripe address as one line, skipping empty parts. */
export function formatAddress(address: AddressLike | null | undefined): string {
  if (!address) return "";
  return [address.line1, address.line2, address.city, address.state, address.postal_code, address.country]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

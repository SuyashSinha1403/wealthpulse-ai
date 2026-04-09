/**
 * Format currency in a compact format for large amounts
 * - INR: Lakhs/Crores (₹6.5 L, ₹2.3 Cr)
 * - Others: K/M/B ($6.5K, €2.3M)
 *
 * Keeps **up to 2 decimals** (trailing zeros removed).
 */
export function formatCompactCurrency(amount: number, currency = "INR"): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";

  const symbol = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
    .format(0)
    .replace(/0/g, "")
    .trim();

  const fmt = (value: number, maxDecimals = 2) => {
    // Keep up to `maxDecimals` but don't force trailing zeros
    const s = value.toFixed(maxDecimals);
    return s
      .replace(/(\.[0-9]*[1-9])0+$/, "$1") // trim trailing zeros but keep significant decimals
      .replace(/\.0+$/, "") // remove .00
      .replace(/\.$/, "");
  };

  if (currency === "INR") {
    if (absAmount >= 10_000_000) {
      const crores = absAmount / 10_000_000;
      const decimals = crores >= 100 ? 0 : 2;
      return `${sign}${symbol}${fmt(crores, decimals)} Cr`;
    }

    if (absAmount >= 100_000) {
      const lakhs = absAmount / 100_000;
      const decimals = lakhs >= 100 ? 0 : 2;
      return `${sign}${symbol}${fmt(lakhs, decimals)} L`;
    }

    if (absAmount >= 1_000) {
      const thousands = absAmount / 1_000;
      const decimals = thousands >= 100 ? 0 : 2;
      return `${sign}${symbol}${fmt(thousands, decimals)} K`;
    }
  } else {
    if (absAmount >= 1_000_000_000) {
      const billions = absAmount / 1_000_000_000;
      const decimals = billions >= 100 ? 0 : 2;
      return `${sign}${symbol}${fmt(billions, decimals)}B`;
    }

    if (absAmount >= 1_000_000) {
      const millions = absAmount / 1_000_000;
      const decimals = millions >= 100 ? 0 : 2;
      return `${sign}${symbol}${fmt(millions, decimals)}M`;
    }

    if (absAmount >= 1_000) {
      const thousands = absAmount / 1_000;
      const decimals = thousands >= 100 ? 0 : 2;
      return `${sign}${symbol}${fmt(thousands, decimals)}K`;
    }
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}


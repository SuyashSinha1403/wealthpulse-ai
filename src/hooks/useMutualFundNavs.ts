import { useState, useCallback } from "react";

interface MutualFundNav {
  price: number;
  previousClose: number;
  currency: string;
  name: string;
  category: string;
  timestamp: string;
  error?: string;
}

/**
 * Fetches latest NAVs for Indian mutual funds using MFAPI (https://api.mfapi.in).
 * Expects each key to be the mutual fund scheme code used in the URL.
 */
export function useMutualFundNavs() {
  const [prices, setPrices] = useState<Record<string, MutualFundNav>>({});
  const [loading, setLoading] = useState(false);

  const fetchPrices = useCallback(async (schemeCodes: string[]) => {
    const uniqueCodes = Array.from(
      new Set((schemeCodes || []).map((c) => c.trim()).filter(Boolean))
    );
    if (uniqueCodes.length === 0) return;

    setLoading(true);
    try {
      const results = await Promise.all(
        uniqueCodes.map(async (code) => {
          try {
            const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
            if (!res.ok) {
              return [
                code,
                {
                  price: 0,
                  previousClose: 0,
                  currency: "INR",
                  name: code,
                  category: "",
                  timestamp: new Date().toISOString(),
                  error: `HTTP ${res.status}`,
                } as MutualFundNav,
              ] as const;
            }

            const json = await res.json();
            const latest = Array.isArray(json?.data) && json.data.length > 0 ? json.data[0] : null;
            const nav = latest ? parseFloat(latest.nav) : NaN;

            if (!latest || !Number.isFinite(nav)) {
              return [
                code,
                {
                  price: 0,
                  previousClose: 0,
                  currency: "INR",
                  name: json?.meta?.scheme_name || code,
                  category: json?.meta?.scheme_category || "",
                  timestamp: latest?.date || new Date().toISOString(),
                  error: "Invalid NAV data",
                } as MutualFundNav,
              ] as const;
            }

            return [
              code,
              {
                price: nav,
                previousClose: nav,
                currency: "INR",
                name: json?.meta?.scheme_name || code,
                category: json?.meta?.scheme_category || "",
                timestamp: latest.date,
              } as MutualFundNav,
            ] as const;
          } catch (e: any) {
            return [
              code,
              {
                price: 0,
                previousClose: 0,
                currency: "INR",
                name: code,
                category: "",
                timestamp: new Date().toISOString(),
                error: e?.message || "Failed to fetch NAV",
              } as MutualFundNav,
            ] as const;
          }
        })
      );

      const next: Record<string, MutualFundNav> = {};
      for (const [code, nav] of results) {
        next[code] = nav;
      }
      setPrices((prev) => ({ ...prev, ...next }));
    } finally {
      setLoading(false);
    }
  }, []);

  return { prices, loading, fetchPrices };
}


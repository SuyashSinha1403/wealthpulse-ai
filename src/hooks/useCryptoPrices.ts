import { useState, useCallback } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

interface CryptoPrice {
  price: number;
  price_change_24h: number;
  price_change_percentage_24h: number;
  market_cap: number;
  name: string;
  symbol: string;
  currency: string;
  timestamp: string;
  error?: string;
}

export function useCryptoPrices() {
  const [prices, setPrices] = useState<Record<string, CryptoPrice>>({});
  const [loading, setLoading] = useState(false);

  const fetchPrices = useCallback(async (cryptoIds: string[], currency = "usd") => {
    if (cryptoIds.length === 0) return;
    setLoading(true);
    try {
      const url = `${SUPABASE_URL}/functions/v1/crypto-price?ids=${cryptoIds.join(",")}&currency=${currency}`;
      const res = await fetch(url, {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const json = await res.json();
      if (json.data) {
        setPrices(json.data);
      }
    } catch (e) {
      console.error("Failed to fetch crypto prices:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { prices, loading, fetchPrices };
}

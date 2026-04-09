import { useState, useCallback } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

interface PriceData {
  price: number;
  previousClose: number;
  currency: string;
  name: string;
  timestamp: string;
  error?: string;
}

export function useStockPrices() {
  const [prices, setPrices] = useState<Record<string, PriceData>>({});
  const [loading, setLoading] = useState(false);

  const fetchPrices = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setLoading(true);
    try {
      const url = `${SUPABASE_URL}/functions/v1/stock-price?tickers=${tickers.join(",")}`;
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
      console.error("Failed to fetch stock prices:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { prices, loading, fetchPrices };
}

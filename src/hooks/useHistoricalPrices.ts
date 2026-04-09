import { useState, useCallback } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

export interface HistoricalPrice {
  date: string;
  close: number;
}

export function useHistoricalPrices() {
  const [history, setHistory] = useState<Record<string, HistoricalPrice[]>>({});
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (tickers: string[], period1: number, period2: number) => {
    if (tickers.length === 0) return;
    setLoading(true);
    try {
      const url = `${SUPABASE_URL}/functions/v1/stock-price?tickers=${tickers.join(",")}&history=true&period1=${period1}&period2=${period2}&interval=1d`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      const json = await res.json();
      if (json.data) {
        setHistory((prev) => ({ ...prev, ...json.data }));
      }
    } catch (e) {
      console.error("Failed to fetch historical prices:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { history, loading, fetchHistory };
}

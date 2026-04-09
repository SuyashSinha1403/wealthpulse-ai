import { useState, useCallback } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/integrations/supabase/client";

interface FxData {
  from: string;
  to: string;
  rate: number;
  timestamp: string;
  error?: string;
}

export function useExchangeRates() {
  const [rates, setRates] = useState<Record<string, FxData>>({});
  const [loading, setLoading] = useState(false);

  const fetchRates = useCallback(async (pairs: { from: string; to: string }[]) => {
    // Filter out same-currency pairs
    const needed = pairs.filter((p) => p.from !== p.to);
    if (needed.length === 0) return;

    setLoading(true);
    try {
      const pairsParam = needed.map((p) => `${p.from}-${p.to}`).join(",");
      const url = `${SUPABASE_URL}/functions/v1/exchange-rate?pairs=${pairsParam}`;
      const res = await fetch(url, {
        headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      });
      const json = await res.json();
      if (json.data) {
        setRates((prev) => ({ ...prev, ...json.data }));
      }
    } catch (e) {
      console.error("Failed to fetch exchange rates:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const getRate = useCallback(
    (from: string, to: string): number => {
      if (from === to) return 1;

      const directKey = `${from}-${to}`;
      const direct = rates[directKey]?.rate;
      if (direct && direct > 0) return direct;

      const reverseKey = `${to}-${from}`;
      const reverse = rates[reverseKey]?.rate;
      if (reverse && reverse > 0) return 1 / reverse;

      return 0;
    },
    [rates]
  );

  return { rates, loading, fetchRates, getRate };
}

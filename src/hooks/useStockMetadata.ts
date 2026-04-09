import { useState, useCallback } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

export interface StockMetadata {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  country: string;
  currency: string;
}

const ALLOWED_SECTORS = new Set([
  "Technology",
  "Financial Services",
  "Healthcare",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Industrials",
  "Basic Materials",
  "Real Estate",
  "Utilities",
  "Communication Services",
]);

function isValidSector(sector: string | null | undefined): boolean {
  return !!sector && ALLOWED_SECTORS.has(sector);
}

export function useStockMetadata() {
  const [metadata, setMetadata] = useState<Record<string, StockMetadata>>({});
  const [loading, setLoading] = useState(false);

  const fetchMetadata = useCallback(async (tickers: string[]) => {
    if (tickers.length === 0) return;
    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from("stocks_metadata")
        .select("*")
        .in("ticker", tickers);

      const existingMap: Record<string, StockMetadata> = {};
      (existing || []).forEach((row: any) => {
        existingMap[row.ticker] = row;
      });

      const toRefresh = tickers.filter((ticker) => {
        const row = existingMap[ticker];
        return !row || !isValidSector(row.sector);
      });

      if (toRefresh.length > 0) {
        const url = `${SUPABASE_URL}/functions/v1/stock-price?tickers=${toRefresh.join(",")}&metadata=true`;
        const res = await fetch(url, {
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
        });
        const json = await res.json();

        if (json.data) {
          const toUpsert: any[] = [];
          for (const ticker of toRefresh) {
            const d = json.data[ticker];
            if (!d || d.error) continue;

            const sector = isValidSector(d.sector) ? d.sector : "Unclassified";
            const meta: StockMetadata = {
              ticker,
              company_name: d.name || ticker,
              sector,
              industry: d.industry || "",
              country: d.country || "",
              currency: d.currency || "USD",
            };

            existingMap[ticker] = meta;
            toUpsert.push({
              ticker,
              company_name: meta.company_name,
              sector: meta.sector,
              industry: meta.industry,
              country: meta.country,
              currency: meta.currency,
              updated_at: new Date().toISOString(),
            });
          }

          if (toUpsert.length > 0) {
            await supabase.from("stocks_metadata").upsert(toUpsert as any, { onConflict: "ticker" });
          }
        }
      }

      setMetadata(existingMap);
    } catch (e) {
      console.error("Failed to fetch stock metadata:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { metadata, loading, fetchMetadata };
}

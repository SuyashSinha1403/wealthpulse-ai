import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "SGD", "AED"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function useBaseCurrency() {
  const { user } = useAuth();
  const [baseCurrency, setBaseCurrency] = useState<SupportedCurrency>("INR");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("currency")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.currency) setBaseCurrency(data.currency as SupportedCurrency);
        setLoading(false);
      });
  }, [user]);

  const updateBaseCurrency = useCallback(
    async (currency: SupportedCurrency) => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({ currency })
        .eq("user_id", user.id);
      if (!error) setBaseCurrency(currency);
      return error;
    },
    [user]
  );

  return { baseCurrency, loading, updateBaseCurrency };
}

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface InsightsFinancialData {
  totalIncome: number;
  totalExpenses: number;
  savingsRate: number;
  totalInvestments: number;
  totalLiabilities: number;
  netWorth: number;
  expenseRatio: number;
  portfolioReturn: number | null;
  allocation: { name: string; value: number }[];
  topExpenseCategories: { category: string; amount: number }[];
}

function toMonthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case "Quarterly":
      return amount / 3;
    case "Yearly":
      return amount / 12;
    case "One-time":
      return 0;
    default:
      return amount;
  }
}

export function useInsightsFinancialData() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InsightsFinancialData | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user: authUser },
          error: authError,
        } = await supabase.auth.getUser();

        console.log("Current user:", authUser?.id);

        if (authError) {
          throw authError;
        }

        if (!authUser) {
          if (!cancelled) {
            setData(null);
            setLoading(false);
          }
          return;
        }

        const [incRes, expRes, invRes, liabRes, bankRes] = await Promise.all([
          supabase
            .from("income_entries")
            .select("base_currency_value, frequency")
            .eq("user_id", authUser.id),
          supabase
            .from("expenses")
            .select("amount, base_currency_value, category, date")
            .eq("user_id", authUser.id),
          supabase
            .from("investments")
            .select("asset_class, current_value, base_currency_value")
            .eq("user_id", authUser.id),
          supabase
            .from("liabilities")
            .select("outstanding_amount, base_currency_value")
            .eq("user_id", authUser.id),
          supabase
            .from("bank_accounts")
            .select("balance, base_currency_value")
            .eq("user_id", authUser.id),
        ]);

        console.log("Insights financial data query result:", {
          incomeEntries: incRes.data,
          expenses: expRes.data,
          investments: invRes.data,
          liabilities: liabRes.data,
          bankAccounts: bankRes.data,
        });

        const anyError = incRes.error || expRes.error || invRes.error || liabRes.error || bankRes.error;
        if (anyError) throw anyError;

        const totalInvestments = (invRes.data || []).reduce(
          (s, i: any) => s + Number(i.base_currency_value ?? i.current_value ?? 0),
          0
        );

        const bankBalance = (bankRes.data || []).reduce(
          (s, b: any) => s + Number(b.base_currency_value ?? b.balance ?? 0),
          0
        );

        const totalLiabilities = (liabRes.data || []).reduce(
          (s, l: any) => s + Number(l.base_currency_value ?? l.outstanding_amount ?? 0),
          0
        );

        const now = new Date();
        const thisMonthExpenses = (expRes.data || []).filter((e: any) => {
          const d = new Date(e.date);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });

        const totalExpenses = thisMonthExpenses.reduce(
          (s: number, e: any) => s + Number(e.base_currency_value ?? e.amount ?? 0),
          0
        );

        const totalIncome = (incRes.data || []).reduce(
          (s: number, e: any) => s + toMonthlyEquivalent(Number(e.base_currency_value || 0), e.frequency),
          0
        );

        const catMap: Record<string, number> = {};
        thisMonthExpenses.forEach((e: any) => {
          catMap[e.category] = (catMap[e.category] || 0) + Number(e.base_currency_value ?? e.amount ?? 0);
        });

        const topExpenseCategories = Object.entries(catMap)
          .map(([category, amount]) => ({ category, amount }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5);

        const allocationMap: Record<string, number> = {};
        (invRes.data || []).forEach((i: any) => {
          allocationMap[i.asset_class] =
            (allocationMap[i.asset_class] || 0) + Number(i.base_currency_value ?? i.current_value ?? 0);
        });
        if (bankBalance > 0) allocationMap["Cash"] = bankBalance;
        const allocation = Object.entries(allocationMap).map(([name, value]) => ({ name, value }));

        const netWorth = bankBalance + totalInvestments - totalLiabilities;

        const savingsRate =
          totalIncome > 0 ? Number((((totalIncome - totalExpenses) / totalIncome) * 100).toFixed(1)) : 0;

        const expenseRatio = totalIncome > 0 ? Number(((totalExpenses / totalIncome) * 100).toFixed(1)) : 0;

        const computed: InsightsFinancialData = {
          totalIncome,
          totalExpenses,
          savingsRate,
          totalInvestments,
          totalLiabilities,
          netWorth,
          expenseRatio,
          portfolioReturn: null,
          allocation,
          topExpenseCategories,
        };

        if (!cancelled) setData(computed);
      } catch (e: any) {
        console.error("Insights financial data query failed", e);
        if (!cancelled) {
          setError(e?.message || "Failed to load financial summary");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  const value = useMemo(() => ({ data, loading, error }), [data, loading, error]);
  return value;
}

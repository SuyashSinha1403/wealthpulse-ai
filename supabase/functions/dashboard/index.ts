import { corsHeaders, createAuthedClient, jsonResponse, sumNumbers } from "../_shared/financial.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const { supabase, user, errorResponse } = await createAuthedClient(req);
    if (errorResponse || !supabase || !user) return errorResponse!;

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const [cashRes, invRes, liabRes, txRes] = await Promise.all([
      supabase.from("bank_accounts").select("balance, base_currency_value").eq("user_id", user.id),
      supabase.from("investments").select("current_value, base_currency_value").eq("user_id", user.id),
      supabase.from("liabilities").select("outstanding_amount, base_currency_value").eq("user_id", user.id),
      supabase
        .from("transactions")
        .select("amount, type, created_at")
        .eq("user_id", user.id)
        .gte("created_at", monthStart)
        .lt("created_at", monthEnd),
    ]);

    const anyError = cashRes.error || invRes.error || liabRes.error || txRes.error;
    if (anyError) return jsonResponse({ error: anyError.message }, { status: 500 });

    const cash = sumNumbers(cashRes.data ?? [], (row: any) => Number(row.base_currency_value ?? row.balance ?? 0));
    const investments = sumNumbers(invRes.data ?? [], (row: any) => Number(row.base_currency_value ?? row.current_value ?? 0));
    const liabilities = sumNumbers(liabRes.data ?? [], (row: any) => Number(row.base_currency_value ?? row.outstanding_amount ?? 0));
    const monthlyExpenses = sumNumbers(
      (txRes.data ?? []).filter((t: any) => t.type === "debit"),
      (row: any) => Number(row.amount ?? 0),
    );
    const monthlyIncome = sumNumbers(
      (txRes.data ?? []).filter((t: any) => t.type === "credit"),
      (row: any) => Number(row.amount ?? 0),
    );

    const netWorth = cash + investments - liabilities;
    const savingsRate = monthlyIncome > 0
      ? Number((((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100).toFixed(2))
      : 0;

    return jsonResponse({
      net_worth: netWorth,
      cash,
      investments,
      liabilities,
      monthly_expenses: monthlyExpenses,
      savings_rate: savingsRate,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});


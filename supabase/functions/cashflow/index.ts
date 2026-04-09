import { corsHeaders, createAuthedClient, jsonResponse, sumNumbers } from "../_shared/financial.ts";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const { supabase, user, errorResponse } = await createAuthedClient(req);
    if (errorResponse || !supabase || !user) return errorResponse!;

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const { data, error } = await supabase
      .from("transactions")
      .select("amount, type, created_at")
      .eq("user_id", user.id)
      .gte("created_at", sixMonthsAgo.toISOString())
      .order("created_at", { ascending: true });

    if (error) return jsonResponse({ error: error.message }, { status: 500 });

    const income = sumNumbers((data ?? []).filter((r: any) => r.type === "credit"), (r: any) => Number(r.amount ?? 0));
    const expenses = sumNumbers((data ?? []).filter((r: any) => r.type === "debit"), (r: any) => Number(r.amount ?? 0));
    const savings = income - expenses;

    const trendMap: Record<string, { income: number; expenses: number }> = {};
    for (const row of data ?? []) {
      const key = monthKey(new Date((row as any).created_at));
      if (!trendMap[key]) trendMap[key] = { income: 0, expenses: 0 };
      const amount = Number((row as any).amount ?? 0);
      if ((row as any).type === "credit") trendMap[key].income += amount;
      if ((row as any).type === "debit") trendMap[key].expenses += amount;
    }

    const trends = Object.entries(trendMap).map(([month, vals]) => ({
      month,
      income: vals.income,
      expenses: vals.expenses,
      savings: vals.income - vals.expenses,
    }));

    return jsonResponse({ income, expenses, savings, trends });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});


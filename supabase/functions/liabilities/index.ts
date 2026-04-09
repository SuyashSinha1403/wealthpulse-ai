import { corsHeaders, createAuthedClient, jsonResponse, sumNumbers } from "../_shared/financial.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, { status: 405 });

  try {
    const { supabase, user, errorResponse } = await createAuthedClient(req);
    if (errorResponse || !supabase || !user) return errorResponse!;

    const { data, error } = await supabase
      .from("liabilities")
      .select("outstanding_amount, base_currency_value, monthly_payment")
      .eq("user_id", user.id);

    if (error) return jsonResponse({ error: error.message }, { status: 500 });

    const totalDebt = sumNumbers(data ?? [], (row: any) => Number(row.base_currency_value ?? row.outstanding_amount ?? 0));
    const monthlyPayments = sumNumbers(data ?? [], (row: any) => Number(row.monthly_payment ?? 0));
    const activeLoans = (data ?? []).filter((row: any) => Number(row.outstanding_amount ?? 0) > 0).length;

    return jsonResponse({
      total_debt: totalDebt,
      monthly_payments: monthlyPayments,
      active_loans: activeLoans,
    });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});


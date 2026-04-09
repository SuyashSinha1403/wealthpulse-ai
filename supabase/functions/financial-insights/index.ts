import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const contextInstructions: Record<string, string> = {
  dashboard: `You are analyzing the user's OVERALL financial health across all areas — income, expenses, investments, liabilities, and net worth. Provide a holistic assessment covering savings habits, debt management, investment diversification, and net worth trajectory.`,
  cashflow: `You are analyzing ONLY the user's cash flow — income vs expenses, savings rate, and spending patterns. Focus exclusively on: income adequacy, expense optimization, spending categories, savings rate improvement, and budget recommendations. Do NOT comment on investments or liabilities.`,
  investments: `You are analyzing ONLY the user's investment portfolio. Focus exclusively on: asset allocation, diversification, concentration risk, portfolio returns, and investment strategy recommendations. Do NOT comment on expenses, income, or liabilities.`,
  bank_accounts: `You are analyzing ONLY the user's bank accounts and cash holdings. Focus exclusively on: cash allocation, emergency fund adequacy, idle cash optimization, and whether excess cash should be deployed. Do NOT comment on expenses or investment performance.`,
  liabilities: `You are analyzing ONLY the user's liabilities and debt. Focus exclusively on: debt-to-income ratio, interest rate optimization, repayment strategy, and debt reduction priorities. Do NOT comment on investment returns or spending categories.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { financialData, context } = await req.json();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const { totalIncome, totalExpenses, savingsRate, totalInvestments, totalLiabilities, netWorth, expenseRatio, portfolioReturn, allocation, topExpenseCategories } = financialData;

    const contextInstruction = contextInstructions[context || "dashboard"] || contextInstructions.dashboard;

    const prompt = `${contextInstruction}

Based on the following financial data, provide your focused analysis.

Financial Summary:
- Net Worth: ${netWorth}
- Total Monthly Income: ${totalIncome}
- Total Monthly Expenses: ${totalExpenses}
- Savings Rate: ${savingsRate}%
- Expense-to-Income Ratio: ${expenseRatio}%
- Total Investments: ${totalInvestments}
- Total Liabilities: ${totalLiabilities}
- Portfolio Return: ${portfolioReturn !== null ? portfolioReturn + '%' : 'N/A'}
- Portfolio Allocation: ${JSON.stringify(allocation)}
- Top Expense Categories: ${JSON.stringify(topExpenseCategories)}

Respond in this exact JSON format (no markdown, no code blocks, just raw JSON):
{
  "healthScore": <number 0-100>,
  "summary": "<1-2 sentence overall assessment>",
  "insights": ["<insight 1>", "<insight 2>", "<insight 3>"],
  "recommendations": ["<recommendation 1>", "<recommendation 2>", "<recommendation 3>", "<recommendation 4>"]
}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "You are a concise financial analyst. Always respond with valid JSON only, no markdown formatting." },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Groq API error:", response.status, t);
      throw new Error("Groq API error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = { healthScore: 0, summary: content, insights: [], recommendations: [] };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("financial-insights error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

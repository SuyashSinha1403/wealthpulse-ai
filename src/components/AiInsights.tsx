import { useState } from "react";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";
import { Brain, Sparkles, TrendingUp, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface FinancialData {
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

interface InsightsResult {
  healthScore: number;
  summary: string;
  insights: string[];
  recommendations: string[];
}

interface AiInsightsProps {
  financialData: FinancialData;
  currency: string;
  context?: "dashboard" | "cashflow" | "investments" | "bank_accounts" | "liabilities";
}

const ScoreRing = ({ score }: { score: number }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "hsl(var(--primary))" : score >= 40 ? "hsl(45 93% 47%)" : "hsl(var(--destructive))";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="100" height="100" className="-rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out" />
      </svg>
      <span className="absolute text-2xl font-bold text-foreground">{score}</span>
    </div>
  );
};

export const AiInsights = ({ financialData, currency, context = "dashboard" }: AiInsightsProps) => {
  const [result, setResult] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      const accessToken = session?.access_token;
      if (!accessToken) {
        throw new Error("Please sign in again to generate insights");
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/financial-insights`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ financialData, context, currency }),
      });

      const responseJson = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(responseJson?.error || "Failed to generate insights");
      }

      if (responseJson?.error) {
        throw new Error(responseJson.error);
      }

      setResult(responseJson as InsightsResult);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card rounded-xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          AI Financial Insights
        </h3>
        <Button size="sm" onClick={generate} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {loading ? "Analyzing..." : result ? "Refresh" : "Generate Insights"}
        </Button>
      </div>

      {!result && !loading && (
        <p className="text-muted-foreground text-sm text-center py-8">
          Click "Generate Insights" to get AI-powered analysis of your financial health.
        </p>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Analyzing your finances...</p>
        </div>
      )}

      {result && !loading && (
        <div className="space-y-5">
          <div className="flex items-center gap-5">
            <ScoreRing score={result.healthScore} />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Financial Health Score</p>
              <p className="text-sm text-foreground">{result.summary}</p>
            </div>
          </div>

          {result.insights.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Key Insights
              </p>
              <ul className="space-y-2">
                {result.insights.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.recommendations.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Recommendations
              </p>
              <ul className="space-y-2">
                {result.recommendations.map((item, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

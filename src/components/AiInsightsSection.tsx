import { AiInsights } from "@/components/AiInsights";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { useInsightsFinancialData } from "@/hooks/useInsightsFinancialData";

interface AiInsightsSectionProps {
  context?: "dashboard" | "cashflow" | "investments" | "bank_accounts" | "liabilities";
}

export function AiInsightsSection({ context = "dashboard" }: AiInsightsSectionProps) {
  const { baseCurrency } = useBaseCurrency();
  const { data, loading, error } = useInsightsFinancialData();

  if (loading) {
    return (
      <div className="glass-card rounded-xl p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">Loading AI insights…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card rounded-xl p-4 sm:p-6">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (!data) return null;

  return <AiInsights financialData={data} currency={baseCurrency} context={context} />;
}

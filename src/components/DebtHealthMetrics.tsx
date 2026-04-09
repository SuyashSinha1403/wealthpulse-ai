import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { formatCurrency } from "@/lib/formatCurrency";
import { isRevolvingCredit, getCreditUtilization, getCreditUtilizationLabel, getLoanStatus } from "@/lib/loanCalculations";
import type { Liability } from "@/pages/Liabilities";

interface DebtHealthMetricsProps {
  loans: Liability[];
  totalMonthlyEMI: number;
  totalOutstanding: number;
}

export function DebtHealthMetrics({ loans, totalMonthlyEMI, totalOutstanding }: DebtHealthMetricsProps) {
  const { user } = useAuth();
  const { baseCurrency } = useBaseCurrency();
  const [monthlyIncome, setMonthlyIncome] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchIncome = async () => {
      const { data } = await supabase
        .from("income_entries")
        .select("base_currency_value, frequency")
        .eq("user_id", user.id);
      const total = (data || []).reduce((sum, e: any) => {
        const amt = Number(e.base_currency_value || 0);
        switch (e.frequency) {
          case "Quarterly": return sum + amt / 3;
          case "Yearly": return sum + amt / 12;
          case "One-time": return sum;
          default: return sum + amt;
        }
      }, 0);
      setMonthlyIncome(total);
    };
    fetchIncome();
  }, [user]);

  const dti = monthlyIncome > 0 ? (totalMonthlyEMI / monthlyIncome) * 100 : 0;
  const dtiColor = dti < 30 ? "text-primary" : dti < 40 ? "text-yellow-500" : "text-destructive";
  const dtiLabel = dti < 30 ? "Healthy" : dti < 40 ? "Moderate" : "Risky";
  const dtiBg = dti < 30 ? "bg-primary/10" : dti < 40 ? "bg-yellow-500/10" : "bg-destructive/10";

  // Total interest remaining (fixed loans only)
  const totalInterestRemaining = loans
    .filter(l => !isRevolvingCredit(l.liability_type) && l.original_loan_amount > 0 && l.loan_tenure_months && l.loan_start_date)
    .reduce((s, l) => {
      const status = getLoanStatus(l.original_loan_amount, l.interest_rate, l.loan_tenure_months!, new Date(l.loan_start_date!));
      return s + status.totalInterestRemaining;
    }, 0);

  // Credit utilization average
  const revolvingCards = loans.filter(l => isRevolvingCredit(l.liability_type) && l.credit_limit > 0);
  const avgUtilization = revolvingCards.length > 0
    ? revolvingCards.reduce((s, c) => s + getCreditUtilization(c.outstanding_amount, c.credit_limit), 0) / revolvingCards.length
    : 0;
  const utilLabel = getCreditUtilizationLabel(avgUtilization);

  // High interest debt %
  const highInterestTotal = loans
    .filter(l => isRevolvingCredit(l.liability_type) ? l.interest_rate >= 30 : l.interest_rate >= 15)
    .reduce((s, l) => s + Number(l.outstanding_amount), 0);
  const highInterestPct = totalOutstanding > 0 ? (highInterestTotal / totalOutstanding) * 100 : 0;

  // High interest warnings
  const highInterestLoans = loans.filter(l =>
    isRevolvingCredit(l.liability_type) ? l.interest_rate >= 30 : l.interest_rate >= 15
  );

  return (
    <div className="space-y-4">
      {/* DTI Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Debt-to-Income Ratio</p>
              <p className={`text-3xl font-bold ${dtiColor}`}>{dti.toFixed(1)}%</p>
              <p className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block ${dtiBg} ${dtiColor}`}>
                {dtiLabel}
              </p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>Payments: {formatCurrency(totalMonthlyEMI, baseCurrency)}/mo</p>
              <p>Income: {formatCurrency(monthlyIncome, baseCurrency)}/mo</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional Health Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[10px] text-muted-foreground">Total Interest Remaining</p>
            <p className="text-lg font-bold text-destructive">{formatCurrency(totalInterestRemaining, baseCurrency)}</p>
          </CardContent>
        </Card>

        {revolvingCards.length > 0 && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-[10px] text-muted-foreground">Avg Credit Utilization</p>
              <p className={`text-lg font-bold ${utilLabel.color}`}>{avgUtilization.toFixed(0)}%</p>
              <p className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block ${utilLabel.bg} ${utilLabel.color}`}>
                {utilLabel.label}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[10px] text-muted-foreground">High Interest Debt %</p>
            <p className={`text-lg font-bold ${highInterestPct > 30 ? "text-destructive" : "text-foreground"}`}>
              {highInterestPct.toFixed(0)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-[10px] text-muted-foreground">Total Outstanding</p>
            <p className="text-lg font-bold text-foreground">{formatCurrency(totalOutstanding, baseCurrency)}</p>
          </CardContent>
        </Card>
      </div>

      {/* High Interest Warnings */}
      {highInterestLoans.length > 0 && (
        <Card className="border-destructive/30">
          <CardContent className="pt-4 space-y-2">
            <p className="text-sm font-medium text-destructive">⚠️ High Interest Alerts</p>
            {highInterestLoans.map((l, i) => (
              <p key={i} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{l.lender_name || l.liability_type}</span>
                {isRevolvingCredit(l.liability_type)
                  ? ` has a ${l.interest_rate}% interest rate. Credit card interest is extremely expensive — pay more than the minimum to save significantly.`
                  : ` has a ${l.interest_rate}% interest rate. Prioritize paying this off to save on interest.`}
              </p>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

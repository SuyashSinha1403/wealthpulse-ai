import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/formatCurrency";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import {
  generateAmortization, getLoanStatus, calculatePrepaymentImpact,
  isRevolvingCredit, calculateCreditCardPayoff, getCreditUtilization, getCreditUtilizationLabel,
} from "@/lib/loanCalculations";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { ChevronDown, ChevronUp, CreditCard, TrendingDown } from "lucide-react";
import type { Liability } from "@/pages/Liabilities";

interface LoanAnalyticsProps {
  loans: Liability[];
}

const COLORS = [
  "hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))",
  "hsl(var(--chart-4))", "hsl(var(--chart-5))", "hsl(var(--chart-6, 48 96% 53%))",
];

export function LoanAnalytics({ loans }: LoanAnalyticsProps) {
  const { baseCurrency } = useBaseCurrency();
  const [expandedLoan, setExpandedLoan] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);
  const [prepayForm, setPrepayForm] = useState({ amount: "", loanId: "" });
  const [prepayResult, setPrepayResult] = useState<any>(null);
  const [ccPayoffForm, setCcPayoffForm] = useState({ payment: "" });
  const [ccPayoffResult, setCcPayoffResult] = useState<any>(null);

  const fixedLoans = loans.filter(l => !isRevolvingCredit(l.liability_type));
  const revolvingDebts = loans.filter(l => isRevolvingCredit(l.liability_type));
  const analyticsLoans = fixedLoans.filter(l => l.original_loan_amount > 0 && l.loan_tenure_months && l.loan_start_date);

  const toggleLoan = (id: string) => {
    setExpandedLoan(prev => prev === id ? null : id);
    setShowAllRows(false);
    setPrepayResult(null);
    setCcPayoffResult(null);
    setPrepayForm({ amount: "", loanId: id });
    setCcPayoffForm({ payment: "" });
  };

  const handlePrepay = (loan: Liability) => {
    const extra = Number(prepayForm.amount);
    if (!extra || !loan.loan_tenure_months) return;
    const status = getLoanStatus(loan.original_loan_amount, loan.interest_rate, loan.loan_tenure_months, new Date(loan.loan_start_date!));
    const result = calculatePrepaymentImpact(status.remainingBalance, loan.interest_rate, status.emi, status.monthsRemaining, extra, "lumpsum");
    setPrepayResult(result);
  };

  const handleCcPayoff = (card: Liability) => {
    const payment = Number(ccPayoffForm.payment);
    if (!payment) return;
    const result = calculateCreditCardPayoff(card.outstanding_amount, card.interest_rate, payment);
    setCcPayoffResult(result);
  };

  // Debt distribution data
  const typeMap: Record<string, number> = {};
  loans.forEach(l => { typeMap[l.liability_type] = (typeMap[l.liability_type] || 0) + Number(l.outstanding_amount); });
  const pieData = Object.entries(typeMap).map(([name, value]) => ({ name, value }));

  // Debt snowball (highest interest first)
  const sortedDebts = [...loans].sort((a, b) => b.interest_rate - a.interest_rate);

  const hasAnyData = loans.length > 0;

  if (!hasAnyData) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">Add loans or credit cards to see analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Debt Distribution Chart */}
      {pieData.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Debt Distribution</CardTitle></CardHeader>
          <CardContent>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={35}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v, baseCurrency)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Utilization */}
      {revolvingDebts.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Credit Utilization</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {revolvingDebts.map(card => {
              const util = getCreditUtilization(card.outstanding_amount, card.credit_limit);
              const { label, color, bg } = getCreditUtilizationLabel(util);
              return (
                <div key={card.id} className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <p className="text-sm font-medium">{card.lender_name || card.liability_type}</p>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold ${color}`}>{util.toFixed(0)}%</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${bg} ${color}`}>{label}</span>
                    </div>
                  </div>
                  <Progress value={Math.min(util, 100)} className="h-2" />
                  <p className="text-[10px] text-muted-foreground">
                    {formatCurrency(card.outstanding_amount, card.currency)} / {formatCurrency(card.credit_limit, card.currency)}
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Suggested Repayment Order (Debt Snowball) */}
      {sortedDebts.length > 1 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Suggested Repayment Order</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">Paying high-interest debt first reduces total interest paid.</p>
            {sortedDebts.map((d, i) => (
              <div key={d.id} className="flex items-center gap-3 text-sm">
                <span className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${i === 0 ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                  {i + 1}
                </span>
                <span className="flex-1 truncate">{d.lender_name || d.liability_type}</span>
                <span className={`font-semibold ${i === 0 ? "text-destructive" : "text-foreground"}`}>{d.interest_rate}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Fixed Loan Analytics */}
      {analyticsLoans.map(loan => {
        const status = getLoanStatus(loan.original_loan_amount, loan.interest_rate, loan.loan_tenure_months!, new Date(loan.loan_start_date!));
        const schedule = generateAmortization(loan.original_loan_amount, loan.interest_rate, loan.loan_tenure_months!);
        const isExpanded = expandedLoan === loan.id;
        const step = Math.max(1, Math.floor(schedule.length / 36));
        const chartData = schedule.filter((_, i) => i % step === 0 || i === schedule.length - 1).map(row => ({
          month: row.month, Interest: row.interest, Principal: row.principal, Balance: row.balance,
        }));

        return (
          <Card key={loan.id} className="overflow-hidden">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleLoan(loan.id)}>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{loan.liability_type}</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {loan.lender_name && `${loan.lender_name} · `}{formatCurrency(loan.original_loan_amount, loan.currency)} @ {loan.interest_rate}%
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold">{status.completionPercent}%</p>
                    <p className="text-xs text-muted-foreground">complete</p>
                  </div>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
              <Progress value={status.completionPercent} className="h-2 mt-2" />
            </CardHeader>
            {isExpanded && (
              <CardContent className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: "Remaining Balance", value: formatCurrency(status.remainingBalance, loan.currency) },
                    { label: "Principal Paid", value: formatCurrency(status.principalPaid, loan.currency) },
                    { label: "Interest Paid", value: formatCurrency(status.interestPaid, loan.currency), destructive: true },
                    { label: "Months Left", value: status.monthsRemaining.toString() },
                    { label: "Interest Remaining", value: formatCurrency(status.totalInterestRemaining, loan.currency), destructive: true },
                    { label: "Monthly EMI", value: formatCurrency(status.emi, loan.currency) },
                  ].map(({ label, value, destructive }) => (
                    <div key={label} className="bg-accent/40 rounded-lg p-3 text-center">
                      <p className="text-[10px] text-muted-foreground">{label}</p>
                      <p className={`text-sm font-bold ${destructive ? "text-destructive" : "text-foreground"}`}>{value}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium mb-2">Interest vs Principal Over Time</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => formatCurrency(v, loan.currency)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Bar dataKey="Interest" fill="hsl(var(--destructive))" stackId="a" />
                          <Bar dataKey="Principal" fill="hsl(var(--primary))" stackId="a" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium mb-2">Outstanding Balance Over Time</h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => formatCurrency(v, loan.currency)} />
                          <Area type="monotone" dataKey="Balance" fill="hsl(var(--chart-5))" stroke="hsl(var(--chart-5))" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Amortization Schedule</h4>
                  <div className="rounded-md border overflow-auto max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Month</TableHead>
                          <TableHead className="text-xs">EMI</TableHead>
                          <TableHead className="text-xs">Interest</TableHead>
                          <TableHead className="text-xs">Principal</TableHead>
                          <TableHead className="text-xs">Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(showAllRows ? schedule : schedule.slice(0, 12)).map(row => (
                          <TableRow key={row.month} className={row.month <= status.paidMonths ? "bg-accent/20" : ""}>
                            <TableCell className="text-xs py-1.5">{row.month}</TableCell>
                            <TableCell className="text-xs py-1.5">{formatCurrency(row.emi, loan.currency)}</TableCell>
                            <TableCell className="text-xs py-1.5 text-destructive">{formatCurrency(row.interest, loan.currency)}</TableCell>
                            <TableCell className="text-xs py-1.5">{formatCurrency(row.principal, loan.currency)}</TableCell>
                            <TableCell className="text-xs py-1.5">{formatCurrency(row.balance, loan.currency)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {schedule.length > 12 && (
                    <Button variant="ghost" size="sm" className="w-full mt-1 text-xs" onClick={() => setShowAllRows(!showAllRows)}>
                      {showAllRows ? "Show Less" : `Show All ${schedule.length} Months`}
                    </Button>
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-2">Prepayment Simulator</h4>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Extra lump sum payment" value={prepayForm.amount}
                      onChange={e => setPrepayForm(f => ({ ...f, amount: e.target.value }))} className="bg-background" />
                    <Button onClick={() => handlePrepay(loan)} className="gradient-primary text-primary-foreground shrink-0">Simulate</Button>
                  </div>
                  {prepayResult && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div className="bg-accent/40 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Years Saved</p>
                        <p className="text-lg font-bold text-foreground">{prepayResult.yearsSaved}</p>
                      </div>
                      <div className="bg-accent/40 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Interest Saved</p>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(prepayResult.interestSaved, loan.currency)}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Credit Card Payoff Simulators */}
      {revolvingDebts.map(card => {
        const isExpanded = expandedLoan === card.id;
        const minPay = card.outstanding_amount * (card.min_payment_percent / 100);
        const minResult = calculateCreditCardPayoff(card.outstanding_amount, card.interest_rate, minPay);

        return (
          <Card key={card.id} className="overflow-hidden">
            <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => toggleLoan(card.id)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-chart-2" />
                  <div>
                    <CardTitle className="text-base">{card.lender_name || card.liability_type}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {formatCurrency(card.outstanding_amount, card.currency)} @ {card.interest_rate}%
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>
            </CardHeader>
            {isExpanded && (
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="bg-accent/40 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Balance</p>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(card.outstanding_amount, card.currency)}</p>
                  </div>
                  <div className="bg-accent/40 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Monthly Interest</p>
                    <p className="text-sm font-bold text-destructive">{formatCurrency(card.outstanding_amount * card.interest_rate / 1200, card.currency)}</p>
                  </div>
                  <div className="bg-accent/40 rounded-lg p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">Min Payment ({card.min_payment_percent}%)</p>
                    <p className="text-sm font-bold text-foreground">{formatCurrency(minPay, card.currency)}</p>
                  </div>
                </div>

                {/* Min payment warning */}
                {minResult.months !== Infinity && minResult.months > 24 && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                    <p className="text-xs text-destructive font-medium">⚠️ Paying only the minimum ({formatCurrency(minPay, card.currency)}/mo) will take {minResult.months} months and cost {formatCurrency(minResult.totalInterest, card.currency)} in interest!</p>
                  </div>
                )}

                {/* Credit Card Payoff Simulator */}
                <div>
                  <h4 className="text-sm font-medium mb-2">Payoff Simulator</h4>
                  <div className="flex gap-2">
                    <Input type="number" placeholder="Monthly payment amount" value={ccPayoffForm.payment}
                      onChange={e => setCcPayoffForm({ payment: e.target.value })} className="bg-background" />
                    <Button onClick={() => handleCcPayoff(card)} className="gradient-primary text-primary-foreground shrink-0">Simulate</Button>
                  </div>
                  {ccPayoffResult && ccPayoffResult.months !== Infinity && (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="bg-accent/40 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Months to Repay</p>
                        <p className="text-lg font-bold text-foreground">{ccPayoffResult.months}</p>
                      </div>
                      <div className="bg-accent/40 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Total Interest</p>
                        <p className="text-lg font-bold text-destructive">{formatCurrency(ccPayoffResult.totalInterest, card.currency)}</p>
                      </div>
                      <div className="bg-accent/40 rounded-lg p-3 text-center">
                        <p className="text-[10px] text-muted-foreground">Total Paid</p>
                        <p className="text-lg font-bold text-foreground">{formatCurrency(ccPayoffResult.totalPaid, card.currency)}</p>
                      </div>
                    </div>
                  )}
                  {ccPayoffResult && ccPayoffResult.months === Infinity && (
                    <p className="text-sm text-destructive text-center mt-2">Payment too low to cover monthly interest.</p>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

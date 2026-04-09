import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Wallet, Clock, CreditCard } from "lucide-react";
import { calculateEMI, calculateMaxLoan, calculateTenure, calculateCreditCardPayoff } from "@/lib/loanCalculations";
import { formatCurrency } from "@/lib/formatCurrency";
import { useBaseCurrency } from "@/hooks/useBaseCurrency";
import { addMonths, format } from "date-fns";

export function LoanPlanner() {
  const { baseCurrency } = useBaseCurrency();

  // EMI Calculator
  const [emiForm, setEmiForm] = useState({ amount: "", rate: "", years: "" });
  const [emiResult, setEmiResult] = useState<any>(null);

  // Affordability Calculator
  const [affForm, setAffForm] = useState({ emi: "", rate: "", years: "" });
  const [affResult, setAffResult] = useState<any>(null);

  // Tenure Calculator
  const [tenForm, setTenForm] = useState({ amount: "", rate: "", emi: "" });
  const [tenResult, setTenResult] = useState<any>(null);

  // Credit Card Payoff Planner
  const [ccForm, setCcForm] = useState({ balance: "", rate: "", payment: "" });
  const [ccResult, setCcResult] = useState<any>(null);

  const calcEMI = () => {
    const p = Number(emiForm.amount); const r = Number(emiForm.rate); const n = Number(emiForm.years) * 12;
    if (!p || !n) return;
    const emi = calculateEMI(p, r, n);
    const totalPaid = emi * n;
    setEmiResult({ emi: Math.round(emi), totalInterest: Math.round(totalPaid - p), totalPaid: Math.round(totalPaid), payoffDate: format(addMonths(new Date(), n), "MMM yyyy") });
  };

  const calcAffordability = () => {
    const e = Number(affForm.emi); const r = Number(affForm.rate); const n = Number(affForm.years) * 12;
    if (!e || !n) return;
    setAffResult({ maxLoan: Math.round(calculateMaxLoan(e, r, n)) });
  };

  const calcTenure = () => {
    const p = Number(tenForm.amount); const r = Number(tenForm.rate); const e = Number(tenForm.emi);
    if (!p || !e) return;
    const months = calculateTenure(p, r, e);
    if (months === Infinity) { setTenResult({ error: "EMI too low to cover interest" }); }
    else { setTenResult({ months, years: (months / 12).toFixed(1), payoffDate: format(addMonths(new Date(), months), "MMM yyyy") }); }
  };

  const calcCC = () => {
    const b = Number(ccForm.balance); const r = Number(ccForm.rate); const p = Number(ccForm.payment);
    if (!b || !p) return;
    const result = calculateCreditCardPayoff(b, r, p);
    if (result.months === Infinity) { setCcResult({ error: "Payment too low to cover monthly interest" }); return; }
    // Also calc with higher payment for comparison
    const higherPay = p * 1.5;
    const higherResult = calculateCreditCardPayoff(b, r, higherPay);
    setCcResult({
      ...result,
      interestSavedIfHigher: result.totalInterest - higherResult.totalInterest,
      monthsSavedIfHigher: result.months - higherResult.months,
      higherPayment: Math.round(higherPay),
    });
  };

  const inputCls = "bg-background";

  return (
    <div className="space-y-4">
      <Tabs defaultValue="emi" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="emi" className="text-xs sm:text-sm gap-1">
            <Calculator className="h-3.5 w-3.5 hidden sm:block" />EMI
          </TabsTrigger>
          <TabsTrigger value="afford" className="text-xs sm:text-sm gap-1">
            <Wallet className="h-3.5 w-3.5 hidden sm:block" />Afford
          </TabsTrigger>
          <TabsTrigger value="tenure" className="text-xs sm:text-sm gap-1">
            <Clock className="h-3.5 w-3.5 hidden sm:block" />Tenure
          </TabsTrigger>
          <TabsTrigger value="cc" className="text-xs sm:text-sm gap-1">
            <CreditCard className="h-3.5 w-3.5 hidden sm:block" />Card
          </TabsTrigger>
        </TabsList>

        <TabsContent value="emi">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">EMI Calculator</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs">Loan Amount</Label>
                  <Input className={inputCls} type="number" value={emiForm.amount} onChange={e => setEmiForm(f => ({ ...f, amount: e.target.value }))} placeholder="1000000" /></div>
                <div className="space-y-1"><Label className="text-xs">Rate (%)</Label>
                  <Input className={inputCls} type="number" step="0.1" value={emiForm.rate} onChange={e => setEmiForm(f => ({ ...f, rate: e.target.value }))} placeholder="10" /></div>
                <div className="space-y-1"><Label className="text-xs">Years</Label>
                  <Input className={inputCls} type="number" value={emiForm.years} onChange={e => setEmiForm(f => ({ ...f, years: e.target.value }))} placeholder="10" /></div>
              </div>
              <Button onClick={calcEMI} className="w-full gradient-primary text-primary-foreground">Calculate EMI</Button>
              {emiResult && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Monthly EMI</p><p className="text-lg font-bold text-foreground">{formatCurrency(emiResult.emi, baseCurrency)}</p></div>
                  <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Total Interest</p><p className="text-lg font-bold text-destructive">{formatCurrency(emiResult.totalInterest, baseCurrency)}</p></div>
                  <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Total Payment</p><p className="text-lg font-bold text-foreground">{formatCurrency(emiResult.totalPaid, baseCurrency)}</p></div>
                  <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Payoff Date</p><p className="text-lg font-bold text-foreground">{emiResult.payoffDate}</p></div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="afford">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Affordability Calculator</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs">Monthly EMI</Label>
                  <Input className={inputCls} type="number" value={affForm.emi} onChange={e => setAffForm(f => ({ ...f, emi: e.target.value }))} placeholder="15000" /></div>
                <div className="space-y-1"><Label className="text-xs">Rate (%)</Label>
                  <Input className={inputCls} type="number" step="0.1" value={affForm.rate} onChange={e => setAffForm(f => ({ ...f, rate: e.target.value }))} placeholder="10" /></div>
                <div className="space-y-1"><Label className="text-xs">Years</Label>
                  <Input className={inputCls} type="number" value={affForm.years} onChange={e => setAffForm(f => ({ ...f, years: e.target.value }))} placeholder="10" /></div>
              </div>
              <Button onClick={calcAffordability} className="w-full gradient-primary text-primary-foreground">Calculate Max Loan</Button>
              {affResult && (
                <div className="bg-accent/50 rounded-lg p-4 text-center"><p className="text-xs text-muted-foreground">Maximum Loan You Can Take</p><p className="text-2xl font-bold text-foreground">{formatCurrency(affResult.maxLoan, baseCurrency)}</p></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tenure">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Tenure Calculator</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs">Loan Amount</Label>
                  <Input className={inputCls} type="number" value={tenForm.amount} onChange={e => setTenForm(f => ({ ...f, amount: e.target.value }))} placeholder="1000000" /></div>
                <div className="space-y-1"><Label className="text-xs">Rate (%)</Label>
                  <Input className={inputCls} type="number" step="0.1" value={tenForm.rate} onChange={e => setTenForm(f => ({ ...f, rate: e.target.value }))} placeholder="10" /></div>
                <div className="space-y-1"><Label className="text-xs">EMI</Label>
                  <Input className={inputCls} type="number" value={tenForm.emi} onChange={e => setTenForm(f => ({ ...f, emi: e.target.value }))} placeholder="15000" /></div>
              </div>
              <Button onClick={calcTenure} className="w-full gradient-primary text-primary-foreground">Calculate Tenure</Button>
              {tenResult && !tenResult.error && (
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Months Required</p><p className="text-2xl font-bold text-foreground">{tenResult.months}</p></div>
                  <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">≈ Years</p><p className="text-2xl font-bold text-foreground">{tenResult.years}</p></div>
                </div>
              )}
              {tenResult?.error && <p className="text-sm text-destructive text-center">{tenResult.error}</p>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cc">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Credit Card Payoff Planner</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1"><Label className="text-xs">Balance</Label>
                  <Input className={inputCls} type="number" value={ccForm.balance} onChange={e => setCcForm(f => ({ ...f, balance: e.target.value }))} placeholder="50000" /></div>
                <div className="space-y-1"><Label className="text-xs">Rate (%)</Label>
                  <Input className={inputCls} type="number" step="0.1" value={ccForm.rate} onChange={e => setCcForm(f => ({ ...f, rate: e.target.value }))} placeholder="36" /></div>
                <div className="space-y-1"><Label className="text-xs">Payment/mo</Label>
                  <Input className={inputCls} type="number" value={ccForm.payment} onChange={e => setCcForm(f => ({ ...f, payment: e.target.value }))} placeholder="5000" /></div>
              </div>
              <Button onClick={calcCC} className="w-full gradient-primary text-primary-foreground">Calculate Payoff</Button>
              {ccResult && !ccResult.error && (
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Months</p><p className="text-lg font-bold text-foreground">{ccResult.months}</p></div>
                    <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Total Interest</p><p className="text-lg font-bold text-destructive">{formatCurrency(ccResult.totalInterest, baseCurrency)}</p></div>
                    <div className="bg-accent/50 rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground">Total Paid</p><p className="text-lg font-bold text-foreground">{formatCurrency(ccResult.totalPaid, baseCurrency)}</p></div>
                  </div>
                  {ccResult.interestSavedIfHigher > 0 && (
                    <div className="bg-primary/10 rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground">💡 Paying {formatCurrency(ccResult.higherPayment, baseCurrency)}/mo instead could save</p>
                      <p className="text-sm font-bold text-primary">{formatCurrency(ccResult.interestSavedIfHigher, baseCurrency)} in interest & {ccResult.monthsSavedIfHigher} months</p>
                    </div>
                  )}
                </div>
              )}
              {ccResult?.error && <p className="text-sm text-destructive text-center">{ccResult.error}</p>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

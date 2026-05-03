import { useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeIndianRupee,
  Brain,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  Info,
  LineChart,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type Persona = "student" | "first_salary" | "salaried" | "freelancer" | "family";
type Risk = "protect" | "balanced" | "growth";
type Stability = "stable" | "variable" | "uncertain";

const personaLabels: Record<Persona, string> = {
  student: "Student",
  first_salary: "First salary",
  salaried: "Salaried professional",
  freelancer: "Freelancer",
  family: "Family contributor",
};

const riskLabels: Record<Risk, string> = {
  protect: "I cannot lose this money",
  balanced: "I can handle small ups and downs",
  growth: "I want growth and can wait",
};

const formatMoney = (value: number) =>
  `Rs. ${Math.round(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const getHorizon = (months: number) => {
  if (months <= 12) {
    return {
      label: "Short term",
      description: "Protect capital first. Avoid equity-heavy choices for money needed soon.",
      expectedReturn: 0.055,
      safe: 90,
      growth: 10,
    };
  }
  if (months <= 36) {
    return {
      label: "Intermediate term",
      description: "Blend stability with measured growth because the goal has some time.",
      expectedReturn: 0.075,
      safe: 70,
      growth: 30,
    };
  }
  return {
    label: "Medium term",
    description: "Allow more growth exposure, but keep the goal protected from sharp volatility.",
    expectedReturn: 0.095,
    safe: 55,
    growth: 45,
  };
};

const monthlyRequired = (target: number, current: number, months: number, annualReturn: number) => {
  const remaining = Math.max(target - current, 0);
  if (remaining <= 0) return 0;
  const monthlyRate = annualReturn / 12;
  if (monthlyRate <= 0) return remaining / months;
  return (remaining * monthlyRate) / (Math.pow(1 + monthlyRate, months) - 1);
};

const GoalPlanner = () => {
  const [persona, setPersona] = useState<Persona>("salaried");
  const [age, setAge] = useState(24);
  const [salary, setSalary] = useState(75000);
  const [expenses, setExpenses] = useState(45000);
  const [savings, setSavings] = useState(80000);
  const [liabilities, setLiabilities] = useState(50000);
  const [dependents, setDependents] = useState(0);
  const [stability, setStability] = useState<Stability>("stable");
  const [risk, setRisk] = useState<Risk>("balanced");
  const [goalName, setGoalName] = useState("Emergency fund + first investment plan");
  const [goalAmount, setGoalAmount] = useState(300000);
  const [timeline, setTimeline] = useState(18);
  const [notes, setNotes] = useState("I want a plan that feels safe and does not disturb monthly expenses.");
  const [incomeShock, setIncomeShock] = useState(0);
  const [expenseShock, setExpenseShock] = useState(0);

  const plan = useMemo(() => {
    const horizon = getHorizon(timeline);
    const emergencyNeed = expenses * (dependents > 0 ? 6 : 4);
    const monthlySurplus = Math.max(salary - expenses, 0);
    const adjustedSalary = salary * (1 - incomeShock / 100);
    const adjustedExpenses = expenses * (1 + expenseShock / 100);
    const adjustedSurplus = Math.max(adjustedSalary - adjustedExpenses, 0);
    const baseSafe = horizon.safe + (risk === "protect" ? 8 : risk === "growth" ? -10 : 0);
    const safeAllocation = clamp(baseSafe + (stability === "uncertain" ? 8 : stability === "variable" ? 4 : 0), 45, 95);
    const growthAllocation = 100 - safeAllocation;
    const expectedReturn = horizon.expectedReturn + (risk === "growth" ? 0.012 : risk === "protect" ? -0.008 : 0);
    const requiredMonthly = monthlyRequired(goalAmount, savings, timeline, expectedReturn);
    const affordability = monthlySurplus <= 0 ? 0 : requiredMonthly / monthlySurplus;
    const adjustedRequiredShare = adjustedSurplus <= 0 ? 999 : requiredMonthly / adjustedSurplus;
    const healthScore = clamp(
      Math.round(
        82 -
          affordability * 18 -
          (savings < emergencyNeed ? 10 : 0) -
          (liabilities > salary * 2 ? 8 : 0) -
          dependents * 2 -
          (stability === "uncertain" ? 8 : stability === "variable" ? 4 : 0),
      ),
      35,
      94,
    );
    const monthlySafe = requiredMonthly * (safeAllocation / 100);
    const monthlyGrowth = requiredMonthly - monthlySafe;
    const status =
      requiredMonthly === 0
        ? "Already funded"
        : affordability <= 0.45
          ? "Comfortable"
          : affordability <= 0.75
            ? "Tight but possible"
            : "Needs adjustment";

    return {
      horizon,
      emergencyNeed,
      monthlySurplus,
      adjustedSurplus,
      safeAllocation,
      growthAllocation,
      requiredMonthly,
      monthlySafe,
      monthlyGrowth,
      healthScore,
      status,
      adjustedRequiredShare,
    };
  }, [age, dependents, expenses, goalAmount, incomeShock, liabilities, risk, salary, savings, stability, timeline]);

  const nextActions = [
    savings < plan.emergencyNeed
      ? `Move ${formatMoney(Math.min(plan.emergencyNeed - savings, plan.monthlySurplus))} first into an emergency bucket.`
      : "Keep emergency money separate from growth investments.",
    `Start an auto-transfer of ${formatMoney(plan.requiredMonthly)} on salary day.`,
    timeline <= 12
      ? "Keep the goal mostly in savings, FD, RD, or liquid-fund style buckets."
      : "Split the plan into a safe bucket and a controlled growth bucket.",
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 pb-24">
      <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-xl border border-border/70 bg-card/70 p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI Goal Planner
            </span>
            <span className="rounded-full border border-border/70 px-3 py-1 text-xs text-muted-foreground">
              {plan.horizon.label}
            </span>
          </div>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Turn salary, expenses, and goals into a practical investment plan.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
            WealthPulse asks the context a human advisor would ask first, then suggests a plan for money you need in the next few months to five years.
          </p>
        </div>

        <Card className="border-primary/20 bg-primary/8">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Brain className="h-5 w-5 text-primary" />
              Plan Readiness
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <span className="text-5xl font-bold text-foreground">{plan.healthScore}</span>
              <span className="pb-2 text-sm text-muted-foreground">/ 100</span>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{plan.horizon.description}</p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <UserRound className="h-5 w-5 text-primary" />
                Prior Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>User type</Label>
                <Select value={persona} onValueChange={(value) => setPersona(value as Persona)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(personaLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Age</Label>
                  <Input type="number" value={age} onChange={(e) => setAge(Number(e.target.value))} />
                </div>
                <div className="grid gap-2">
                  <Label>Dependents</Label>
                  <Input type="number" value={dependents} onChange={(e) => setDependents(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Monthly income</Label>
                  <Input type="number" value={salary} onChange={(e) => setSalary(Number(e.target.value))} />
                </div>
                <div className="grid gap-2">
                  <Label>Monthly expenses</Label>
                  <Input type="number" value={expenses} onChange={(e) => setExpenses(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Current savings</Label>
                  <Input type="number" value={savings} onChange={(e) => setSavings(Number(e.target.value))} />
                </div>
                <div className="grid gap-2">
                  <Label>Liabilities</Label>
                  <Input type="number" value={liabilities} onChange={(e) => setLiabilities(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Income stability</Label>
                <Select value={stability} onValueChange={(value) => setStability(value as Stability)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stable">Stable salary</SelectItem>
                    <SelectItem value="variable">Variable income</SelectItem>
                    <SelectItem value="uncertain">Uncertain for now</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Risk comfort</Label>
                <Select value={risk} onValueChange={(value) => setRisk(value as Risk)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(riskLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5 text-primary" />
                Goal
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label>Goal name</Label>
                <Input value={goalName} onChange={(e) => setGoalName(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Target amount</Label>
                  <Input type="number" value={goalAmount} onChange={(e) => setGoalAmount(Number(e.target.value))} />
                </div>
                <div className="grid gap-2">
                  <Label>Timeline months</Label>
                  <Input type="number" value={timeline} onChange={(e) => setTimeline(Number(e.target.value))} />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Anything the AI should know?</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-muted/20">
              <CardTitle className="flex items-center gap-2 text-lg">
                <BadgeIndianRupee className="h-5 w-5 text-primary" />
                AI Recommended Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="grid gap-0 md:grid-cols-3">
                <div className="border-b border-border/70 p-5 md:border-b-0 md:border-r">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Monthly action</p>
                  <p className="mt-2 text-3xl font-bold">{formatMoney(plan.requiredMonthly)}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{plan.status}</p>
                </div>
                <div className="border-b border-border/70 p-5 md:border-b-0 md:border-r">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Safe bucket</p>
                  <p className="mt-2 text-3xl font-bold">{plan.safeAllocation}%</p>
                  <p className="mt-2 text-sm text-muted-foreground">{formatMoney(plan.monthlySafe)} monthly</p>
                </div>
                <div className="p-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Growth bucket</p>
                  <p className="mt-2 text-3xl font-bold">{plan.growthAllocation}%</p>
                  <p className="mt-2 text-sm text-muted-foreground">{formatMoney(plan.monthlyGrowth)} monthly</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="explain" className="w-full">
            <TabsList className="grid h-auto w-full grid-cols-3">
              <TabsTrigger value="explain">Explain</TabsTrigger>
              <TabsTrigger value="nudges">Nudges</TabsTrigger>
              <TabsTrigger value="simulate">What if</TabsTrigger>
            </TabsList>
            <TabsContent value="explain" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Info className="h-4 w-4 text-primary" />
                      Why this plan?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      {goalName} is a {plan.horizon.label.toLowerCase()} goal, so the app avoids treating it like a trading portfolio.
                    </p>
                    <p>
                      Your monthly surplus is {formatMoney(plan.monthlySurplus)}. The required action uses {Math.round((plan.requiredMonthly / Math.max(plan.monthlySurplus, 1)) * 100)}% of that surplus.
                    </p>
                    <p>
                      Emergency target: {formatMoney(plan.emergencyNeed)} based on expenses, dependents, and income stability.
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <CircleAlert className="h-4 w-4 text-amber-500" />
                      What can go wrong?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground">
                    <p>Income volatility can make the monthly transfer hard to sustain.</p>
                    <p>A market correction can hurt the growth bucket if the goal date is close.</p>
                    <p>Large unplanned family expenses can break the plan if emergency money is mixed with investments.</p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="nudges" className="mt-4">
              <div className="grid gap-4 lg:grid-cols-3">
                {nextActions.map((action) => (
                  <Card key={action}>
                    <CardContent className="flex gap-3 p-4">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      <p className="text-sm text-muted-foreground">{action}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="simulate" className="mt-4">
              <Card>
                <CardContent className="grid gap-6 p-5 lg:grid-cols-[1fr_280px]">
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Income drop</Label>
                        <span className="text-sm text-muted-foreground">{incomeShock}%</span>
                      </div>
                      <Slider value={[incomeShock]} min={0} max={60} step={5} onValueChange={([value]) => setIncomeShock(value)} />
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label>Expense increase</Label>
                        <span className="text-sm text-muted-foreground">{expenseShock}%</span>
                      </div>
                      <Slider value={[expenseShock]} min={0} max={60} step={5} onValueChange={([value]) => setExpenseShock(value)} />
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Stress result</p>
                    <p className="mt-2 text-2xl font-bold">{formatMoney(plan.adjustedSurplus)}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      The plan uses {plan.adjustedRequiredShare > 9 ? "more than all" : `${Math.round(plan.adjustedRequiredShare * 100)}% of`} stressed monthly surplus.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="grid gap-4 md:grid-cols-4">
            {[
              { label: "Profile", value: personaLabels[persona], icon: UserRound },
              { label: "Horizon", value: plan.horizon.label, icon: CalendarClock },
              { label: "Safety", value: `${plan.safeAllocation}%`, icon: ShieldCheck },
              { label: "Growth", value: `${plan.growthAllocation}%`, icon: TrendingUp },
            ].map((item) => (
              <Card key={item.label}>
                <CardContent className="p-4">
                  <item.icon className="mb-3 h-5 w-5 text-primary" />
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-primary/20">
            <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <LineChart className="h-4 w-4 text-primary" />
                  Future step
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Connect real cash-flow signals from bank and UPI notifications to update this plan automatically every month.
                </p>
              </div>
              <Button className="gap-2">
                Review plan
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GoalPlanner;

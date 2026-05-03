import { ArrowRight, CandlestickChart, Landmark, PlugZap, ShieldCheck, Sparkles, Target, TrendingUp, WalletCards } from "lucide-react";
import { Suspense, lazy } from "react";
import type { ComponentType } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const Hero3DScene = lazy(() => import("@/components/Hero3DScene").then((m) => ({ default: m.Hero3DScene })));

const trustCards = [
  { title: "Read-only sync", description: "No money movement", icon: ShieldCheck },
  { title: "Built for Bharat", description: "FDs, EPF, PPF, bonds", icon: Landmark },
  { title: "Goal-first AI", description: "Plan before products", icon: Target },
];

const capabilities = [
  {
    icon: CandlestickChart,
    title: "Ask context before advice",
    description: "Uses age, income, expenses, savings, liabilities, dependents, timeline, and risk comfort.",
  },
  {
    icon: WalletCards,
    title: "Show exact monthly buckets",
    description: "Breaks money into safety, liquidity, and growth buckets instead of vague investment tips.",
  },
  {
    icon: PlugZap,
    title: "Sync or track anything",
    description: "Connect brokers and banks, or manually track EPF, PPF, bonds, FDs, ESOPs, cash, and wallets.",
  },
];

interface LandingFeatureCardProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "top" | "bottom";
}

const cardTitleClassName = "text-sm font-semibold leading-5 tracking-normal text-white";
const cardDescriptionClassName = "mt-2 text-sm leading-6 text-slate-300";

function LandingFeatureCard({ title, description, icon: Icon, tone = "bottom" }: LandingFeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition-all",
        tone === "top"
          ? "border-white/10 bg-white/[0.06] hover:border-emerald-500/30 hover:bg-white/[0.08]"
          : "border-white/10 bg-white/[0.04] hover:border-emerald-500/20 hover:bg-white/[0.07]",
      )}
    >
      <div
        className={cn(
          "absolute rounded-full blur-2xl transition-all",
          tone === "top"
            ? "-right-4 -top-4 h-16 w-16 bg-emerald-500/12 group-hover:bg-emerald-500/20"
            : "-left-6 -bottom-6 h-20 w-20 bg-teal-500/8 group-hover:bg-emerald-500/15",
        )}
      />
      <div className="relative flex items-start gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center border bg-emerald-500/10",
            tone === "top" ? "h-10 w-10 rounded-xl border-emerald-500/20" : "h-11 w-11 rounded-2xl border-emerald-400/20",
          )}
        >
          <Icon className={cn("text-emerald-300", tone === "top" ? "h-5 w-5 text-emerald-400" : "h-5 w-5")} />
        </div>
        <div className="min-w-0">
          <h3 className={cardTitleClassName}>{title}</h3>
          <p className={cardDescriptionClassName}>{description}</p>
        </div>
      </div>
    </div>
  );
}

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(16,185,129,0.16),transparent_52%),linear-gradient(180deg,rgba(3,7,18,0.92),rgba(2,6,23,1))]" />
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(2,6,23,0.82)_0%,rgba(2,6,23,0.58)_38%,rgba(2,6,23,0.94)_70%,rgba(2,6,23,1)_100%)] sm:bg-[linear-gradient(180deg,rgba(2,6,23,0.68)_0%,rgba(2,6,23,0.42)_42%,rgba(2,6,23,0.90)_78%,rgba(2,6,23,1)_100%)]" />

      <Suspense fallback={null}>
        <Hero3DScene />
      </Suspense>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-8 pt-safe sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-3 py-4 sm:py-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <img src="/brand-mark.svg" alt="WealthPulse" className="h-9 w-9 shrink-0 rounded-xl object-contain shadow-lg shadow-emerald-500/20 sm:h-11 sm:w-11" />
            <span className="truncate text-lg font-bold tracking-normal sm:text-2xl">WealthPulse</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center pb-8 pt-8 text-center sm:py-16 lg:py-20">
          <div className="max-w-4xl space-y-5 sm:space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300 backdrop-blur-md sm:px-4 sm:py-1.5 sm:text-sm">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              AI investment planner for Bharat
            </div>

            <h1 className="text-[2.55rem] font-bold leading-[0.98] tracking-normal sm:text-6xl lg:text-7xl xl:text-8xl">
              <span className="block">Know what to do</span>
              <span className="block bg-gradient-to-r from-emerald-200 via-emerald-400 to-teal-200 bg-clip-text text-transparent">
                with your money
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-base leading-7 text-slate-200/88 sm:text-lg lg:text-xl lg:leading-8">
              WealthPulse asks your age, income, expenses, savings, risk comfort, and goal, then turns it into a practical
              monthly plan for short and intermediate-term investments.
            </p>

            <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center sm:gap-4">
              <Button asChild size="lg" className="h-12 w-full rounded-full bg-emerald-500 px-8 text-sm font-semibold text-white shadow-[0_20px_60px_rgba(16,185,129,0.35)] transition-all hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-[0_25px_70px_rgba(16,185,129,0.45)] sm:w-auto sm:text-base">
                <Link to="/auth">
                  Start AI goal plan
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="relative z-10 space-y-3 pb-safe sm:space-y-6">
          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {trustCards.map((card) => (
              <LandingFeatureCard key={card.title} {...card} tone="top" />
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
            {capabilities.map((item) => (
              <LandingFeatureCard key={item.title} {...item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;

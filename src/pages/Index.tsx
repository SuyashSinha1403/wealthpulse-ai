import { ArrowRight, CandlestickChart, Landmark, ShieldCheck, Sparkles, TrendingUp, Wallet, BarChart3 } from "lucide-react";
import { Suspense, lazy } from "react";
import type { ComponentType } from "react";
import { Link, Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const Hero3DScene = lazy(() => import("@/components/Hero3DScene").then(m => ({ default: m.Hero3DScene })));

const trustCards = [
  { title: "Security", description: "Bank-grade", icon: ShieldCheck },
  { title: "Privacy", description: "Never sold", icon: BarChart3 },
  { title: "Account access", description: "Read-only", icon: Wallet },
];

const capabilities = [
  {
    icon: CandlestickChart,
    title: "Find where you're silently losing money",
    description: "Detect hidden spending patterns, recurring leaks, and unnecessary expenses across your accounts.",
  },
  {
    icon: Landmark,
    title: "Stay ahead of your cash flow — not behind it",
    description: "See upcoming expenses, obligations, and savings capacity before the month gets out of control.",
  },
  {
    icon: TrendingUp,
    title: "Know what to fix next",
    description: "Get clear signals on risks, tax inefficiencies, and portfolio imbalances so you can improve your financial decisions with confidence.",
  },
];

interface LandingFeatureCardProps {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  tone?: "top" | "bottom";
}

const cardTitleClassName = "text-sm font-semibold leading-5 tracking-[-0.01em] text-white";
const cardDescriptionClassName = "mt-2 text-sm leading-6 text-slate-300";

function LandingFeatureCard({ title, description, icon: Icon, tone = "bottom" }: LandingFeatureCardProps) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border p-5 backdrop-blur-xl transition-all",
        tone === "top"
          ? "border-white/10 bg-white/[0.04] hover:border-emerald-500/30 hover:bg-white/[0.07]"
          : "border-white/10 bg-white/[0.03] hover:border-emerald-500/20 hover:bg-white/[0.06]",
      )}
    >
      <div
        className={cn(
          "absolute rounded-full blur-2xl transition-all",
          tone === "top"
            ? "-right-4 -top-4 h-16 w-16 bg-emerald-500/10 group-hover:bg-emerald-500/20"
            : "-left-6 -bottom-6 h-20 w-20 bg-emerald-500/5 group-hover:bg-emerald-500/15",
        )}
      />
      <div className="relative flex items-start gap-4">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center border bg-emerald-500/10",
            tone === "top"
              ? "h-10 w-10 rounded-xl border-emerald-500/20"
              : "h-11 w-11 rounded-2xl border-emerald-400/20",
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
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(16,185,129,0.06),transparent_60%)]" />

      <Suspense fallback={null}>
        <Hero3DScene />
      </Suspense>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 pb-10 pt-4 sm:px-8 sm:pt-6 lg:px-10">
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img src="/brand-mark.svg" alt="WealthPulse" className="h-9 w-9 sm:h-11 sm:w-11 shrink-0 rounded-xl object-contain shadow-lg shadow-emerald-500/20" />
            <span className="text-lg sm:text-2xl font-bold tracking-tight truncate">WealthPulse</span>
          </div>
        </header>

        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center sm:py-16 lg:py-20">
          <div className="max-w-4xl space-y-6 sm:space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 sm:px-4 sm:py-1.5 text-xs sm:text-sm font-medium text-emerald-300 backdrop-blur-md">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              Financial operating system
            </div>

            <h1 className="text-4xl font-bold leading-[0.95] tracking-[-0.04em] sm:text-6xl lg:text-7xl xl:text-8xl">
              <span className="block">Stop guessing</span>
              <span className="block bg-gradient-to-r from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">
                your finances
              </span>
            </h1>

            <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-300/80 sm:text-lg lg:text-xl">
              Track, analyze, and act in one command center. WealthPulse not only shows your net worth, cash flow, investments,
              and liabilities, it helps you understand what changed and what to do next.
            </p>

            <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row sm:justify-center sm:gap-4">
              <Button asChild size="lg" className="w-full sm:w-auto h-12 sm:h-13 rounded-full bg-emerald-500 px-8 text-sm sm:text-base font-semibold text-white shadow-[0_20px_60px_rgba(16,185,129,0.35)] transition-all hover:-translate-y-0.5 hover:bg-emerald-400 hover:shadow-[0_25px_70px_rgba(16,185,129,0.45)]">
                <Link to="/auth">
                  Start tracking your wealth
                  <ArrowRight className="ml-2 h-4 w-4 sm:h-5 sm:w-5" />
                </Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-4 pb-8 sm:space-y-6">
          <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
            {trustCards.map((card) => (
              <LandingFeatureCard key={card.title} {...card} tone="top" />
            ))}
          </div>

          <div className="grid gap-3 sm:gap-4 sm:grid-cols-3">
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

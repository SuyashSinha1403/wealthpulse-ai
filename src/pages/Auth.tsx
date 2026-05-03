import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Landmark, ShieldCheck, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { BrandBackdrop } from "@/components/BrandBackdrop";
import { BrandMark } from "@/components/BrandMark";
import PasswordValidation, { isPasswordValid } from "@/components/PasswordValidation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

const features = [
  {
    icon: Target,
    title: "Goal-first planning",
    body: "Start with the goal, timeline, income, expenses, and risk comfort before choosing products.",
  },
  {
    icon: Landmark,
    title: "Concrete buckets",
    body: "See what can sit in FD, RD, liquid debt, hybrid, index, or gold-style allocations.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy and trust",
    body: "Read-only visibility for analysis. WealthPulse is not designed to move money.",
  },
];

const Auth = () => {
  const { user, loading } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isForgot, setIsForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { signIn, signUp } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = isLogin ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else if (!isLogin) {
      toast.success("Check your email to confirm your account!");
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (error) {
      toast.error("Something went wrong. Please try again.");
    } else {
      toast.success("Reset link sent! Check your email.");
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <BrandBackdrop />
      <div className="brand-grid absolute inset-0 opacity-20" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_10%,rgba(16,185,129,0.18),transparent_36%),radial-gradient(ellipse_at_10%_0%,rgba(245,158,11,0.10),transparent_30%),linear-gradient(180deg,rgba(2,6,23,0.20),rgba(2,6,23,0.96))]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 pt-safe sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-3">
          <BrandMark subtitle="AI investment planner" inverse />
          <Button asChild variant="ghost" className="rounded-full px-3 text-white/72 hover:bg-white/6 hover:text-white sm:px-4">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Back home</span>
            </Link>
          </Button>
        </header>

        <div className="grid flex-1 items-center gap-7 py-7 lg:grid-cols-[minmax(0,1fr)_460px] lg:gap-10">
          <section className="order-2 lg:order-1">
            <div className="mx-auto w-full max-w-[620px] space-y-6 lg:mx-0 lg:ml-auto lg:space-y-8">
              <div className="space-y-4 text-center lg:text-left">
                <div className="brand-kicker">Private financial access</div>
                <h2 className="text-4xl font-semibold leading-[1.02] tracking-normal text-white sm:text-5xl">
                  Turn your money context into a plan
                </h2>
                <p className="mx-auto max-w-[560px] text-base leading-7 text-slate-300 sm:text-lg sm:leading-8 lg:mx-0">
                  WealthPulse helps Indians decide how much to invest monthly, what should stay safe, and what can grow for
                  short, intermediate, and long-term goals.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
                {features.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="brand-shell rounded-2xl p-4 sm:p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/14 bg-emerald-400/10">
                      <Icon className="h-5 w-5 text-emerald-200" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="order-1 w-full rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-3 shadow-[0_28px_80px_rgba(0,0,0,0.26)] backdrop-blur-2xl sm:rounded-[2rem] sm:p-4 lg:order-2">
            <div className="rounded-[1.35rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.96),rgba(4,7,18,0.90))] p-5 sm:rounded-[1.7rem] sm:p-7">
              <div className="mb-7 lg:hidden">
                <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                  <TrendingUp className="h-3.5 w-3.5" />
                  AI goal access
                </div>
              </div>

              {isForgot ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/65">Password recovery</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">Reset password</h2>
                    <p className="mt-2 text-slate-400">Enter your email to receive a secure reset link.</p>
                  </div>
                  <form onSubmit={handleForgotPassword} className="mt-8 space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="auth-input"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="gradient-primary h-12 w-full rounded-2xl font-semibold text-primary-foreground shadow-[0_18px_50px_rgba(16,185,129,0.25)]"
                      disabled={submitting}
                    >
                      {submitting ? "Sending..." : "Send reset link"}
                    </Button>
                  </form>
                  <p className="mt-5 text-center text-sm text-slate-400">
                    <button onClick={() => setIsForgot(false)} className="font-medium text-emerald-300 hover:text-emerald-200">
                      Back to sign in
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/65">{isLogin ? "Secure access" : "New workspace"}</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-normal text-white">{isLogin ? "Open your planner" : "Create your planner"}</h2>
                    <p className="mt-2 text-slate-400">
                      {isLogin
                        ? "Continue to your goal planner, dashboard, and AI financial insights."
                        : "Start with your goals, income, expenses, savings, and risk comfort."}
                    </p>
                  </div>
                  <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left">
                      <p className="text-sm font-medium text-white">Bank-grade encryption. Read-only access. Your data is never sold.</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">WealthPulse is designed for secure visibility and planning, not money movement.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-slate-300">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="auth-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-slate-300">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={isLogin ? 1 : 8}
                        className="auth-input"
                      />
                      {!isLogin ? <PasswordValidation password={password} show={!isLogin} /> : null}
                    </div>
                    {isLogin ? (
                      <div className="text-right">
                        <button type="button" onClick={() => setIsForgot(true)} className="text-sm font-medium text-emerald-300 hover:text-emerald-200">
                          Forgot password?
                        </button>
                      </div>
                    ) : null}
                    <Button
                      type="submit"
                      className="gradient-primary h-12 w-full rounded-2xl font-semibold text-primary-foreground shadow-[0_18px_50px_rgba(16,185,129,0.25)]"
                      disabled={submitting || (!isLogin && !isPasswordValid(password))}
                    >
                      {submitting ? "Please wait..." : isLogin ? "Sign in" : "Create account"}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </form>
                  <p className="mt-5 text-center text-sm text-slate-400">
                    {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
                    <button onClick={() => setIsLogin(!isLogin)} className="font-medium text-emerald-300 hover:text-emerald-200">
                      {isLogin ? "Sign up" : "Sign in"}
                    </button>
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;

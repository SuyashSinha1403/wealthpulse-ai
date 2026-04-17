import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BrandBackdrop } from "@/components/BrandBackdrop";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Landmark, ShieldCheck, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import PasswordValidation, { isPasswordValid } from "@/components/PasswordValidation";

const features = [
  {
    icon: TrendingUp,
    title: "Track your wealth in one place",
    body: "See net worth, investments, and cash flow together without jumping between separate tools.",
  },
  {
    icon: Landmark,
    title: "Read-only financial visibility",
    body: "Connect accounts for analysis and tracking without giving transaction-level control.",
  },
  {
    icon: ShieldCheck,
    title: "Built for privacy and trust",
    body: "Bank-grade encryption and a clear promise that your data is never sold.",
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
      <div className="brand-grid absolute inset-0 opacity-30" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-6 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between gap-3">
          <BrandMark subtitle="Financial command center" inverse />
          <Button asChild variant="ghost" className="rounded-full text-white/72 hover:bg-white/6 hover:text-white">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back home
            </Link>
          </Button>
        </header>

        <div className="grid flex-1 items-center gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_460px]">
          <section className="hidden lg:flex lg:justify-end">
            <div className="w-full max-w-[560px] space-y-8">
              <div className="space-y-4">
                <div className="brand-kicker">Private financial access</div>
                <h2 className="text-5xl font-semibold leading-[1.02] tracking-[-0.06em] text-white">
                  Your financial command center
                </h2>
                <p className="max-w-[520px] text-lg leading-8 text-slate-300">
                  Track your wealth, cash flow, and investments, all in one place. WealthPulse helps you understand your
                  numbers and improve the decisions behind them.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                {features.map(({ icon: Icon, title, body }) => (
                  <div key={title} className="brand-shell rounded-[1.5rem] p-5">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/14 bg-emerald-400/10">
                      <Icon className="h-5 w-5 text-emerald-200" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-400">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="brand-panel w-full max-w-xl rounded-[2rem] p-4 sm:p-6 lg:max-w-none">
            <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.94),rgba(4,7,18,0.88))] p-5 sm:p-7">
              <div className="mb-8 lg:hidden">
                <BrandMark subtitle="Financial command center" inverse />
              </div>
              {isForgot ? (
                <>
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/65">Password recovery</p>
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Reset password</h2>
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
                      className="gradient-primary h-12 w-full rounded-2xl text-primary-foreground font-semibold shadow-[0_18px_50px_rgba(16,185,129,0.25)]"
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
                    <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">{isLogin ? "Your financial command center" : "Create account"}</h2>
                    <p className="mt-2 text-slate-400">
                      {isLogin
                        ? "Track your wealth, cash flow, and investments, all in one place."
                        : "Start tracking your wealth, cash flow, and investments, all in one place."}
                    </p>
                  </div>
                  <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left">
                      <p className="text-sm font-medium text-white">Bank-grade encryption. Read-only access. Your data is never sold.</p>
                      <p className="mt-1 text-xs leading-5 text-slate-400">WealthPulse is designed for secure visibility into your finances, not money movement.</p>
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
                        placeholder=""
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
                      className="gradient-primary h-12 w-full rounded-2xl text-primary-foreground font-semibold shadow-[0_18px_50px_rgba(16,185,129,0.25)]"
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

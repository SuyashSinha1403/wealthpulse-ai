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
import { lovable } from "@/integrations/lovable/index";

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
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10" /></div>
                      <div className="relative flex justify-center text-xs"><span className="bg-[hsl(222,50%,5%)] px-3 text-slate-500">or</span></div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 w-full rounded-2xl border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                      onClick={async () => {
                        const result = await lovable.auth.signInWithOAuth("google", {
                          redirect_uri: window.location.origin,
                        });

                        if (result.error) {
                          toast.error(result.error.message || "Google sign-in failed");
                        }
                      }}
                    >
                      <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      Continue with Google
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

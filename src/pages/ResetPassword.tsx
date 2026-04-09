import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BrandBackdrop } from "@/components/BrandBackdrop";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import PasswordValidation, { isPasswordValid } from "@/components/PasswordValidation";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    } else {
      toast.error("Invalid or expired reset link.");
      navigate("/auth", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPasswordValid(password)) {
      toast.error("Password does not meet the requirements.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      navigate("/dashboard", { replace: true });
    }
  };

  if (!ready) return null;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-6 py-10">
      <BrandBackdrop />
      <div className="brand-grid absolute inset-0 opacity-30" />
      <div className="brand-panel relative z-10 w-full max-w-lg rounded-[2rem] p-4 sm:p-6">
        <div className="rounded-[1.7rem] border border-white/10 bg-[linear-gradient(180deg,rgba(7,12,22,0.94),rgba(4,7,18,0.88))] p-6 sm:p-7">
          <BrandMark subtitle="Credential recovery" inverse />
          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-200/65">Secure access</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white">Set new password</h2>
            <p className="mt-2 text-slate-400">Enter your new password below.</p>
          </div>
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="new-password" className="text-slate-300">New Password</Label>
              <Input
                id="new-password"
                type="password"
                placeholder=""
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="auth-input"
              />
              <PasswordValidation password={password} show />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password" className="text-slate-300">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder=""
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                className="auth-input"
              />
            </div>
            <Button
              type="submit"
              className="gradient-primary h-12 w-full rounded-2xl text-primary-foreground font-semibold shadow-[0_18px_50px_rgba(16,185,129,0.25)]"
              disabled={submitting || !isPasswordValid(password) || password !== confirm}
            >
              {submitting ? "Updating..." : "Update Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;

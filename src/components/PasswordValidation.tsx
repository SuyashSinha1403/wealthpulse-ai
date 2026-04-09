import { Check, X } from "lucide-react";

interface PasswordValidationProps {
  password: string;
  show: boolean;
}

export const passwordRules = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

export const isPasswordValid = (password: string) =>
  passwordRules.every((r) => r.test(password));

const PasswordValidation = ({ password, show }: PasswordValidationProps) => {
  if (!show || !password) return null;

  return (
    <div className="space-y-1 text-xs mt-1.5">
      <p className="text-muted-foreground font-medium">Password must contain:</p>
      {passwordRules.map((rule) => {
        const pass = rule.test(password);
        return (
          <div key={rule.label} className="flex items-center gap-1.5">
            {pass ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <X className="h-3 w-3 text-destructive" />
            )}
            <span className={pass ? "text-green-500" : "text-destructive"}>
              {rule.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default PasswordValidation;

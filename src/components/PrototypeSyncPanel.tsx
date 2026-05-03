import { useState } from "react";
import { ArrowRight, CheckCircle2, Lock, PlugZap, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface PrototypeSyncAction {
  label: string;
  detail: string;
  providers?: string[];
}

interface PrototypeSyncPanelProps {
  title: string;
  description: string;
  actions: PrototypeSyncAction[];
  footnote?: string;
}

export function PrototypeSyncPanel({ title, description, actions, footnote }: PrototypeSyncPanelProps) {
  const [selectedAction, setSelectedAction] = useState<PrototypeSyncAction | null>(null);

  const handleSync = (label: string, provider?: string) => {
    const prefix = provider ? `${provider} ${label}` : label;
    toast.success(`${prefix} sync simulated`, {
      description: provider
        ? `Prototype mode: ${provider} would open a read-only consent flow.`
        : "Prototype mode: this shows the intended consent-based connection flow.",
    });
  };

  const handleAction = (action: PrototypeSyncAction) => {
    if (action.providers?.length) {
      setSelectedAction(action);
      return;
    }
    handleSync(action.label);
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-400/15 bg-[linear-gradient(135deg,rgba(16,185,129,0.10),rgba(15,23,42,0.74))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.18)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <PlugZap className="h-3.5 w-3.5" />
            Prototype sync layer
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[420px]">
          {actions.map((action) => (
            <Button
              key={action.label}
              type="button"
              variant="outline"
              className="h-auto justify-between gap-3 rounded-xl border-emerald-400/20 bg-background/45 px-3 py-3 text-left hover:bg-emerald-400/10"
              onClick={() => handleAction(action)}
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">{action.label}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{action.detail}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-emerald-300" />
            </Button>
          ))}
        </div>
      </div>
      {selectedAction?.providers?.length ? (
        <div className="mt-4 rounded-2xl border border-white/10 bg-background/35 p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{selectedAction.label}</p>
              <p className="text-xs text-muted-foreground">Choose provider to continue read-only sync</p>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedAction(null)}>
              Close
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {selectedAction.providers.map((provider) => (
              <Button
                key={provider}
                type="button"
                variant="outline"
                className="justify-between rounded-xl border-white/10 bg-background/40"
                onClick={() => handleSync(selectedAction.label, provider)}
              >
                {provider}
                <ArrowRight className="h-4 w-4 text-emerald-300" />
              </Button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
          Read-only access
        </div>
        <div className="flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-emerald-300" />
          Consent before connection
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
          No money movement
        </div>
      </div>
      {footnote ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{footnote}</p> : null}
    </section>
  );
}

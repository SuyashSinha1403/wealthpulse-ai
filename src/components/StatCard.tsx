import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useCallback } from "react";

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: string; positive: boolean };
  className?: string;
  onClick?: () => void;
  onLongPress?: () => void;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, className, onClick, onLongPress }: StatCardProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePointerDown = useCallback(() => {
    if (!onLongPress) return;
    didLongPress.current = false;
    timerRef.current = setTimeout(() => {
      didLongPress.current = true;
      onLongPress();
    }, 500);
  }, [onLongPress]);

  const handlePointerUp = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleClick = useCallback(() => {
    if (didLongPress.current) return;
    onClick?.();
  }, [onClick]);

  return (
    <div
      className={cn(
        "stat-card transition-transform duration-200 active:scale-[0.985]",
        onClick && "cursor-pointer hover:scale-[1.02]",
        className,
      )}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-[0.18em] text-white/42">{title}</p>
          <p className="break-all text-lg font-semibold tracking-[-0.04em] text-white sm:text-2xl">{value}</p>
          {subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}
          {trend ? (
            <p className={cn("text-xs font-medium", trend.positive ? "text-profit" : "text-loss")}>
              {trend.positive ? "Up" : "Down"} {trend.value}
            </p>
          ) : null}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/14 bg-emerald-400/10">
          <Icon className="h-5 w-5 text-emerald-200" />
        </div>
      </div>
    </div>
  );
}

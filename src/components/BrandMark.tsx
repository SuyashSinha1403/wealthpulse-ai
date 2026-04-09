import { cn } from "@/lib/utils";

interface BrandMarkProps {
  className?: string;
  labelClassName?: string;
  showLabel?: boolean;
  subtitle?: string;
  inverse?: boolean;
  logoClassName?: string;
}

export function BrandMark({
  className,
  labelClassName,
  showLabel = true,
  subtitle,
  inverse = false,
  logoClassName,
}: BrandMarkProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <img src="/brand-mark.svg" alt="WealthPulse logo" className={cn("h-14 w-14 rounded-xl object-contain", logoClassName)} />
      {showLabel ? (
        <div className={cn("min-w-0", labelClassName)}>
          <p className={cn("text-xl font-semibold tracking-[-0.03em]", inverse ? "text-white" : "text-foreground")}>WealthPulse</p>
          {subtitle ? <p className={cn("text-xs", inverse ? "text-white/55" : "text-muted-foreground")}>{subtitle}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

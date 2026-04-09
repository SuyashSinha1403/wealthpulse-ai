import { cn } from "@/lib/utils";

interface BrandBackdropProps {
  className?: string;
  imageClassName?: string;
  overlayClassName?: string;
}

export function BrandBackdrop({
  className,
  imageClassName,
  overlayClassName,
}: BrandBackdropProps) {
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div
        className={cn(
          "absolute inset-0 bg-cover bg-center opacity-[0.20] saturate-125",
          imageClassName,
        )}
        style={{ backgroundImage: "url('/images/app-bg.jpg')" }}
      />
      <div
        className={cn(
          "absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,147,77,0.16),transparent_34%),radial-gradient(circle_at_70%_22%,rgba(52,211,153,0.18),transparent_30%),linear-gradient(180deg,rgba(3,7,18,0.74),rgba(2,6,23,0.94))]",
          overlayClassName,
        )}
      />
      <div className="absolute -left-24 top-20 h-64 w-64 rounded-full bg-emerald-400/12 blur-3xl" />
      <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-orange-400/10 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-emerald-500/8 blur-3xl" />
    </div>
  );
}

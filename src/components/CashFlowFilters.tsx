import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type RangeOption = "this_month" | "last_month" | "3m" | "6m" | "1y" | "custom";
export type MetricMode = "average" | "total";

interface CashFlowFiltersProps {
  range: RangeOption;
  onRangeChange: (range: RangeOption) => void;
  metric: MetricMode;
  onMetricChange: (metric: MetricMode) => void;
  customStart: Date | undefined;
  customEnd: Date | undefined;
  onCustomStartChange: (date: Date | undefined) => void;
  onCustomEndChange: (date: Date | undefined) => void;
}

const RANGE_OPTIONS: { value: RangeOption; label: string; shortLabel?: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "3m", label: "Last 3 Months", shortLabel: "3M" },
  { value: "6m", label: "Last 6 Months", shortLabel: "6M" },
  { value: "1y", label: "Last 1 Year", shortLabel: "1Y" },
  { value: "custom", label: "Custom" },
];

export function CashFlowFilters({
  range,
  onRangeChange,
  metric,
  onMetricChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: CashFlowFiltersProps) {
  return (
    <div className="space-y-2">
      {/* Range selector */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {RANGE_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={range === opt.value ? "default" : "outline"}
            size="sm"
            className={cn(
              "text-xs h-8 px-3 whitespace-nowrap",
              range === opt.value && "gradient-primary text-primary-foreground"
            )}
            onClick={() => onRangeChange(opt.value)}
          >
            <span className="hidden sm:inline">{opt.label}</span>
            <span className="sm:hidden">{opt.shortLabel || opt.label}</span>
          </Button>
        ))}
      </div>

      {/* Metric toggle */}
      <div className="flex rounded-lg border border-border overflow-hidden w-fit">
        <button
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
            metric === "average"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onMetricChange("average")}
        >
          Average
        </button>
        <button
          className={cn(
            "px-3 py-1.5 text-xs font-medium transition-colors border-l border-border whitespace-nowrap",
            metric === "total"
              ? "bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:text-foreground"
          )}
          onClick={() => onMetricChange("total")}
        >
          Total
        </button>
      </div>

      {/* Custom date pickers */}
      {range === "custom" && (
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerButton
            label="Start Date"
            date={customStart}
            onSelect={onCustomStartChange}
            maxDate={customEnd}
          />
          <span className="text-muted-foreground text-sm">→</span>
          <DatePickerButton
            label="End Date"
            date={customEnd}
            onSelect={onCustomEndChange}
            minDate={customStart}
          />
        </div>
      )}
    </div>
  );
}

function DatePickerButton({
  label,
  date,
  onSelect,
  minDate,
  maxDate,
}: {
  label: string;
  date: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  minDate?: Date;
  maxDate?: Date;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 text-xs justify-start min-w-[140px]",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
          {date ? format(date, "dd MMM yyyy") : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onSelect}
          disabled={(d) =>
            (minDate ? d < minDate : false) || (maxDate ? d > maxDate : false)
          }
          initialFocus
          className="p-3 pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

/** Compute the start/end dates for a given range option */
export function getDateRange(
  range: RangeOption,
  customStart?: Date,
  customEnd?: Date
): { start: Date; end: Date; monthCount: number } {
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  switch (range) {
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start, end: endOfToday, monthCount: 1 };
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return { start, end, monthCount: 1 };
    }
    case "3m": {
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return { start, end: endOfToday, monthCount: 3 };
    }
    case "6m": {
      const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return { start, end: endOfToday, monthCount: 6 };
    }
    case "1y": {
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      return { start, end: endOfToday, monthCount: 12 };
    }
    case "custom": {
      const s = customStart || new Date(now.getFullYear(), now.getMonth(), 1);
      const e = customEnd || endOfToday;
      // Calculate month count between start and end
      const months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
      return { start: s, end: e, monthCount: Math.max(1, months) };
    }
  }
}

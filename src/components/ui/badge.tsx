import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning";
}) {
  const variants: Record<string, string> = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "text-foreground border border-input hover:bg-accent",
    success:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400",
    warning:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

// Status Badge with Dot
export function StatusBadge({
  className,
  status,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  status: "active" | "inactive" | "success" | "warning" | "error" | "pending";
}) {
  const config = {
    active: {
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
    },
    inactive: {
      bg: "bg-slate-100 dark:bg-slate-500/20",
      dot: "bg-slate-400",
      text: "text-slate-700 dark:text-slate-400",
    },
    success: {
      bg: "bg-emerald-100 dark:bg-emerald-500/20",
      dot: "bg-emerald-500",
      text: "text-emerald-700 dark:text-emerald-400",
    },
    warning: {
      bg: "bg-amber-100 dark:bg-amber-500/20",
      dot: "bg-amber-500",
      text: "text-amber-700 dark:text-amber-400",
    },
    error: {
      bg: "bg-rose-100 dark:bg-rose-500/20",
      dot: "bg-rose-500",
      text: "text-rose-700 dark:text-rose-400",
    },
    pending: {
      bg: "bg-blue-100 dark:bg-blue-500/20",
      dot: "bg-blue-500",
      text: "text-blue-700 dark:text-blue-400",
    },
  };

  const style = config[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        style.bg,
        style.text,
        className,
      )}
      {...props}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", style.dot)} />
      {children}
    </div>
  );
}

// Count Badge
export function CountBadge({
  className,
  count,
  max = 99,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  count: number;
  max?: number;
}) {
  if (count <= 0) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        "min-w-[18px] h-[18px] px-1",
        "rounded-full bg-primary text-primary-foreground",
        "text-[10px] font-bold",
        className,
      )}
      {...props}
    >
      {count > max ? `${max}+` : count}
    </span>
  );
}

import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-card text-card-foreground",
        "border border-border/50",
        "shadow-sm shadow-black/5",
        "transition-all duration-200",
        "hover:shadow-md hover:shadow-black/5",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex flex-col space-y-1.5 p-5", className)}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "text-lg font-semibold leading-none tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-muted-foreground leading-relaxed", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center gap-2 p-5 pt-0", className)}
      {...props}
    />
  );
}

// Specialized card variants
export function GradientCard({
  className,
  gradient = "primary",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  gradient?: "primary" | "success" | "warning" | "destructive";
}) {
  const gradients = {
    primary: "from-violet-500 to-purple-600",
    success: "from-emerald-500 to-teal-600",
    warning: "from-amber-500 to-orange-600",
    destructive: "from-rose-500 to-pink-600",
  };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl text-white",
        "bg-gradient-to-br",
        gradients[gradient],
        "shadow-lg shadow-black/10",
        className,
      )}
      {...props}
    />
  );
}

export function GlassCard({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl",
        "bg-white/70 dark:bg-white/5",
        "backdrop-blur-xl",
        "border border-white/30 dark:border-white/10",
        "shadow-lg shadow-black/5",
        className,
      )}
      {...props}
    />
  );
}

export function StatCard({
  className,
  icon: Icon,
  iconBg,
  label,
  value,
  description,
  trend,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  icon: React.ElementType;
  iconBg?: string;
  label: string;
  value: string;
  description?: string;
  trend?: { value: number; isPositive: boolean };
}) {
  return (
    <Card
      className={cn(
        "group cursor-pointer",
        "hover:border-primary/20",
        className,
      )}
      {...props}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center",
              "bg-primary/10 text-primary",
              "transition-transform duration-200 group-hover:scale-110",
              iconBg,
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
          {trend && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                trend.isPositive
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400",
              )}
            >
              {trend.isPositive ? "+" : "-"}
              {trend.value}%
            </div>
          )}
        </div>
        <div className="mt-4">
          <p className="text-2xl font-bold tracking-tight">{value}</p>
          <p className="text-sm font-medium text-muted-foreground mt-0.5">
            {label}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground/70 mt-1">
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

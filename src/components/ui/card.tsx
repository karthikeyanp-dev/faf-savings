import * as React from "react";
import { cn } from "@/lib/utils";

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl bg-card text-card-foreground",
          // Theme-aware visual separation:
          // Light mode relies on soft shadows for elevation.
          // Dark mode uses subtle borders and background contrast.
          "border border-transparent dark:border-border/60",
          "shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
          "transition-all duration-300 ease-out",
          // Interactive states (mostly visible when the card acts as a button or link, or just subtle hover)
          "hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.08)] dark:hover:border-border/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "active:scale-[0.99]",
          className
        )}
        {...props}
      />
    );
  }
);
Card.displayName = "Card";

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex flex-col space-y-1.5 p-6", className)}
      {...props}
    />
  )
);
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn(
        "text-lg font-medium leading-tight tracking-tight text-foreground",
        className
      )}
      {...props}
    />
  )
);
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p
      ref={ref}
      className={cn("text-sm text-muted-foreground/80 leading-relaxed", className)}
      {...props}
    />
  )
);
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("flex items-center gap-3 p-6 pt-0", className)}
      {...props}
    />
  )
);
CardFooter.displayName = "CardFooter";

// Specialized card variants
export const GradientCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { gradient?: "primary" | "success" | "warning" | "destructive" }>(
  ({ className, gradient = "primary", ...props }, ref) => {
    const gradients = {
      primary: "from-violet-500/90 to-purple-600/90 hover:from-violet-500 hover:to-purple-600",
      success: "from-emerald-500/90 to-teal-600/90 hover:from-emerald-500 hover:to-teal-600",
      warning: "from-amber-500/90 to-orange-600/90 hover:from-amber-500 hover:to-orange-600",
      destructive: "from-rose-500/90 to-pink-600/90 hover:from-rose-500 hover:to-pink-600",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative overflow-hidden rounded-xl text-white",
          "bg-gradient-to-br",
          gradients[gradient],
          "shadow-[0_8px_20px_-4px_rgba(0,0,0,0.1)]",
          "transition-all duration-300",
          className
        )}
        {...props}
      />
    );
  }
);
GradientCard.displayName = "GradientCard";

export const GlassCard = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "rounded-xl",
          "bg-white/40 dark:bg-white/[0.07]",
          "backdrop-blur-md",
          "border border-white/20 dark:border-white/15",
          "shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)]",
          "transition-all duration-300 ease-out",
          className
        )}
        {...props}
      />
    );
  }
);
GlassCard.displayName = "GlassCard";

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
        className
      )}
      {...props}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div
            className={cn(
               // Reduced visual noise by making the icon background very subtle
              "w-10 h-10 rounded-lg flex items-center justify-center",
              "bg-muted/50 text-muted-foreground",
              "transition-colors duration-300 group-hover:bg-primary/10 group-hover:text-primary",
              iconBg
            )}
          >
            <Icon className="w-4 h-4" />
          </div>
          {trend && (
            <div
              className={cn(
                "flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md",
                trend.isPositive
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
              )}
            >
              {trend.isPositive ? "+" : "-"}
              {trend.value}%
            </div>
          )}
        </div>
        <div className="mt-5">
          <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
          <p className="text-sm font-medium text-muted-foreground mt-1">
            {label}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground/60 mt-1.5">
              {description}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

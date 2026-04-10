import * as React from "react";
import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "gradient";
  size?: "default" | "sm" | "lg" | "icon";
}) {
  const variants: Record<string, string> = {
    default:
      "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm shadow-primary/20",
    destructive:
      "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm shadow-destructive/20",
    outline:
      "border-2 border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline",
    gradient: "gradient-btn",
  };

  const sizes: Record<string, string> = {
    default: "h-11 px-5 py-2",
    sm: "h-9 rounded-lg px-4 text-xs",
    lg: "h-12 rounded-xl px-8 text-base",
    icon: "h-11 w-11 rounded-xl",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap",
        "rounded-xl text-sm font-semibold",
        "ring-offset-background transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        "active:scale-[0.98]",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}

// Icon Button
export function IconButton({
  className,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline";
}) {
  const variants: Record<string, string> = {
    default: "bg-muted text-foreground hover:bg-muted/80",
    ghost: "hover:bg-muted text-muted-foreground hover:text-foreground",
    outline: "border-2 border-input hover:bg-accent",
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center",
        "w-10 h-10 rounded-xl",
        "transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20",
        "active:scale-95",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

// Floating Action Button
export function Fab({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "flex items-center justify-center",
        "w-14 h-14 rounded-full",
        "gradient-btn",
        "shadow-lg shadow-primary/30",
        "transition-all duration-300",
        "hover:shadow-xl hover:shadow-primary/40 hover:scale-105",
        "active:scale-95",
        className,
      )}
      {...props}
    />
  );
}

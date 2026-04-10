import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex w-full rounded-xl border border-input bg-background px-4 py-3 text-sm",
        "ring-offset-background",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "transition-all duration-200",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

// Modern Input with Icon
export function InputWithIcon({
  className,
  icon: Icon,
  iconPosition = "left",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  icon: React.ElementType;
  iconPosition?: "left" | "right";
}) {
  return (
    <div className="relative">
      <Icon
        className={cn(
          "absolute top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground",
          iconPosition === "left" ? "left-3.5" : "right-3.5",
        )}
      />
      <input
        className={cn(
          "flex w-full rounded-xl border border-input bg-background text-sm",
          "ring-offset-background",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary/30",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          iconPosition === "left" ? "pl-10 pr-4 py-3" : "pl-4 pr-10 py-3",
          className,
        )}
        {...props}
      />
    </div>
  );
}

// Search Input
export function SearchInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative group">
      <svg
        className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-primary"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        className={cn(
          "flex w-full rounded-xl border border-input bg-muted/30 text-sm",
          "pl-10 pr-9 py-3",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:bg-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-200",
          className,
        )}
        {...props}
      />
      {props.value && (
        <button
          type="button"
          onClick={() => {
            const event = {
              target: { value: "" },
            } as React.ChangeEvent<HTMLInputElement>;
            props.onChange?.(event);
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-muted transition-colors"
        >
          <svg
            className="h-3.5 w-3.5 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

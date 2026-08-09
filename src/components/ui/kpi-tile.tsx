import { cn } from "@/lib/utils";

// Compact KPI tile: rounded square icon on the left, label above the
// value on the right. Used in the mobile member cards (3-column grid).
export function KpiTile({
  icon: Icon,
  label,
  value,
  valueClassName,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-2.5 min-w-0">
      <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground truncate">
          {label}
        </p>
        <p className={cn("text-sm font-bold truncate", valueClassName)}>
          {value}
        </p>
      </div>
    </div>
  );
}

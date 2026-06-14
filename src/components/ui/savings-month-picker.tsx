import { useMemo } from 'react';
import { Select, SelectItem } from '@/components/ui/select';
import { getMonthLabels, formatSavingsMonth } from '@/utils/financialYear';
import { cn } from '@/lib/utils';

const MONTHS = getMonthLabels();

/**
 * A two-dropdown month/year picker that reads/writes the `"YYYY-MM"`
 * string format. When `value` is empty, it defaults to the current
 * month and year internally but does not emit until the user picks.
 */
export function SavingsMonthPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: 7 }, (_, i) => currentYear - 3 + i),
    [currentYear],
  );

  // Parse stored value; fall back to current month/year
  const parsed = /^(\d{4})-(\d{2})$/.exec(value);
  const selYear = parsed ? parsed[1] : String(currentYear);
  const selMonth = parsed ? String(parseInt(parsed[2], 10)) : '';

  const displayLabel = value
    ? formatSavingsMonth(value, 'upper')
    : '--- , ---';

  const handleMonthChange = (m: string) => {
    const year = selYear || String(currentYear);
    onChange(`${year}-${m.padStart(2, '0')}`);
  };

  const handleYearChange = (y: string) => {
    if (selMonth) {
      onChange(`${y}-${selMonth.padStart(2, '0')}`);
    } else {
      // No month picked yet — just store year with January
      onChange(`${y}-01`);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {/* Preview label */}
      <p className="text-sm font-semibold text-foreground tracking-wide">
        {displayLabel}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {/* Month select */}
        <Select value={selMonth} onValueChange={handleMonthChange}>
          <SelectItem value="">Month...</SelectItem>
          {MONTHS.map((label, idx) => (
            <SelectItem key={label} value={String(idx + 1)}>
              {label}
            </SelectItem>
          ))}
        </Select>

        {/* Year select */}
        <Select value={selYear} onValueChange={handleYearChange}>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}

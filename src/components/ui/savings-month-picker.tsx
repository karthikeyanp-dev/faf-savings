import { useMemo, useState } from 'react';
import { Select, SelectItem } from '@/components/ui/select';
import { getMonthLabels, formatSavingsMonth } from '@/utils/financialYear';
import { cn } from '@/lib/utils';

const MONTHS = getMonthLabels();

/**
 * A two-dropdown month/year picker that reads/writes the `"YYYY-MM"`
 * string format. The year is held locally until a month is picked, so the
 * picker never emits a month the user did not choose.
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

  // Parse the stored value. A month outside 1-12 (e.g. legacy "2026-00" or
  // "2026-13") is treated as "no month picked" rather than shown as a real
  // selection — and its year is discarded with it, because a value we refuse
  // to display must not silently supply the year of the next month pick.
  const parsed = /^(\d{4})-(\d{2})$/.exec(value);
  const parsedMonth = parsed ? parseInt(parsed[2], 10) : 0;
  const hasMonth = parsedMonth >= 1 && parsedMonth <= 12;
  const parsedYear = parsed && hasMonth ? parsed[1] : null;
  const selMonth = hasMonth ? String(parsedMonth) : '';

  // Year picked before a month exists only in local state — emitting it
  // early would silently stamp January onto the form. Once a real month is
  // stored, the stored year wins again (handleYearChange has already pushed
  // any user change into it), so an external value reset isn't shadowed.
  const [pendingYear, setPendingYear] = useState<string | null>(null);
  const selYear = parsedYear ?? pendingYear ?? String(currentYear);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (let i = 0; i < 7; i++) set.add(currentYear - 3 + i);
    // An older entry's own year must remain selectable, otherwise the
    // <select> renders blank and touching the month re-stamps the wrong year.
    if (parsedYear) set.add(Number(parsedYear));
    return Array.from(set).sort((a, b) => a - b);
  }, [currentYear, parsedYear]);

  const displayLabel = selMonth
    ? formatSavingsMonth(value, 'upper')
    : '--- , ---';

  const handleMonthChange = (m: string) => {
    // The "Month..." placeholder must not produce a value.
    if (!m) return;
    onChange(`${selYear}-${m.padStart(2, '0')}`);
  };

  const handleYearChange = (y: string) => {
    setPendingYear(y);
    if (selMonth) {
      onChange(`${y}-${selMonth.padStart(2, '0')}`);
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

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface MonthYearPickerProps {
  selectedMonth: number; // 1-12
  selectedYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  /**
   * Optional boundaries for the year input (defaults: 1900..2100).
   * Note: users can still type any year if you omit these.
   */
  yearMin?: number;
  yearMax?: number;
  className?: string;
}

const months = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

export function MonthYearPicker({
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
  yearMin = 1900,
  yearMax = 2100,
  className = '',
}: MonthYearPickerProps) {
  const safeYear = useMemo(() => {
    // Keep UI stable even if selectedYear is somehow NaN
    return Number.isFinite(selectedYear) ? selectedYear : new Date().getFullYear();
  }, [selectedYear]);

  const handleYearInput = (raw: string) => {
    const next = parseInt(raw, 10);
    if (!Number.isFinite(next)) return;
    onYearChange(next);
  };

  return (
    <div className={`flex gap-2 ${className}`}>
      <Select value={String(selectedMonth)} onValueChange={(v) => onMonthChange(Number(v))}>
        <SelectTrigger className="flex-1 min-w-0">
          <SelectValue placeholder="Mês" />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          {months.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        inputMode="numeric"
        type="number"
        min={yearMin}
        max={yearMax}
        value={String(safeYear)}
        onChange={(e) => handleYearInput(e.target.value)}
        className="w-[110px]"
        aria-label="Ano"
      />
    </div>
  );
}

/** Combined month-year value as YYYY-MM string picker */
interface CombinedMonthYearPickerProps {
  value: string; // YYYY-MM format
  onChange: (value: string) => void;
  yearMin?: number;
  yearMax?: number;
  className?: string;
}

export function CombinedMonthYearPicker({
  value,
  onChange,
  yearMin,
  yearMax,
  className = '',
}: CombinedMonthYearPickerProps) {
  const [year, month] = value.split('-').map(Number);
  
  const handleMonthChange = (m: number) => {
    onChange(`${year}-${String(m).padStart(2, '0')}`);
  };
  
  const handleYearChange = (y: number) => {
    onChange(`${y}-${String(month).padStart(2, '0')}`);
  };

  return (
    <MonthYearPicker
      selectedMonth={month}
      selectedYear={year}
      onMonthChange={handleMonthChange}
      onYearChange={handleYearChange}
      yearMin={yearMin}
      yearMax={yearMax}
      className={className}
    />
  );
}

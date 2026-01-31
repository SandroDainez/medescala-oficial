import { useState, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MonthYearPickerProps {
  selectedMonth: number; // 1-12
  selectedYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  /** Range of years to show (default: 10 years before/after current year) */
  yearRange?: { start: number; end: number };
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
  yearRange,
  className = '',
}: MonthYearPickerProps) {
  const currentYear = new Date().getFullYear();
  
  const years = useMemo(() => {
    const start = yearRange?.start ?? currentYear - 10;
    const end = yearRange?.end ?? currentYear + 10;
    const result: number[] = [];
    for (let y = end; y >= start; y--) {
      result.push(y);
    }
    return result;
  }, [yearRange, currentYear]);

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
      
      <Select value={String(selectedYear)} onValueChange={(v) => onYearChange(Number(v))}>
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Ano" />
        </SelectTrigger>
        <SelectContent className="max-h-[280px]">
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Combined month-year value as YYYY-MM string picker */
interface CombinedMonthYearPickerProps {
  value: string; // YYYY-MM format
  onChange: (value: string) => void;
  yearRange?: { start: number; end: number };
  className?: string;
}

export function CombinedMonthYearPicker({
  value,
  onChange,
  yearRange,
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
      yearRange={yearRange}
      className={className}
    />
  );
}

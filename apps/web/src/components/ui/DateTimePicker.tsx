import React, { useMemo, useState } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Clock } from 'lucide-react';

export interface DateTimePickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  id?: string;
}

const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const localDate = (value: string) => {
  const parsed = value ? new Date(value) : new Date();
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const DateTimePicker: React.FC<DateTimePickerProps> = ({ label, value, onChange, min, max, error, helperText, required, id = 'datetime-picker' }) => {
  const [open, setOpen] = useState(false);
  const selectedDate = localDate(value);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const timeValue = value ? `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}` : '09:00';
  const errorId = `${id}-error`;
  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const days = useMemo(() => {
    const count = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0).getDate();
    const lead = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1).getDay();
    const cells: (Date | null)[] = [...Array.from({ length: lead }, () => null), ...Array.from({ length: count }, (_, index) => new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index + 1))];
    while (cells.length % 7) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  }, [visibleMonth]);

  const choose = (date: Date, time = timeValue) => {
    const [hours, minutes] = time.split(':').map(Number);
    date.setHours(hours || 0, minutes || 0, 0, 0);
    onChange(date.toISOString());
  };
  const isDisabled = (date: Date) => {
    const minDate = min ? new Date(min) : null;
    const maxDate = max ? new Date(max) : null;
    if (minDate && new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1) <= new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())) return true;
    if (maxDate && new Date(date.getFullYear(), date.getMonth(), date.getDate()) > new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate())) return true;
    return false;
  };
  const displayValue = value
    ? `${selectedDate.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${timeValue}`
    : 'Choose date and time';

  return <div className="w-full flex flex-col gap-1.5 relative">
    <label htmlFor={`${id}-toggle`} className="text-xs font-semibold text-neutral-300">{label}{required && <><span className="ml-1 text-amber-400" aria-hidden="true">*</span><span className="sr-only">, required</span></>}</label>
    <button id={`${id}-toggle`} type="button" aria-haspopup="dialog" aria-expanded={open} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} onClick={() => setOpen((current) => !current)} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }} className={`min-h-11 w-full rounded-xl border bg-neutral-900 px-3.5 text-left text-sm text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${error ? 'border-rose-500' : 'border-neutral-700'}`}>
      <span className="flex items-center gap-3"><Calendar size={17} className="text-neutral-400" aria-hidden="true"/><span className={value ? '' : 'text-neutral-400'}>{displayValue}</span><Calendar size={17} className="ml-auto text-neutral-300" aria-hidden="true"/></span>
    </button>
    {open && <div role="dialog" aria-label={`${label} calendar`} className="absolute z-30 top-full mt-2 w-full min-w-[300px] rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between gap-2"><button type="button" aria-label="Previous month" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="min-h-11 min-w-11 rounded-lg hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-amber-500"><ChevronLeft className="mx-auto" size={18}/></button><p aria-live="polite" className="text-sm font-semibold">{monthLabel}</p><button type="button" aria-label="Next month" onClick={() => setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="min-h-11 min-w-11 rounded-lg hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-amber-500"><ChevronRight className="mx-auto" size={18}/></button></div>
      <table className="w-full table-fixed text-center text-sm"><caption className="sr-only">Choose {label.toLowerCase()}</caption><thead><tr>{['Su','Mo','Tu','We','Th','Fr','Sa'].map((day) => <th key={day} scope="col" className="h-9 text-xs text-neutral-400">{day}</th>)}</tr></thead><tbody>{days.map((week, weekIndex) => <tr key={weekIndex}>{week.map((date, dayIndex) => <td key={`${weekIndex}-${dayIndex}`} className="p-0.5">{date ? <button type="button" disabled={isDisabled(date)} aria-label={`Choose ${date.toLocaleDateString()}`} aria-pressed={Boolean(value && sameDay(date, selectedDate))} onClick={() => choose(date)} className={`min-h-10 w-full rounded-lg text-sm focus-visible:ring-2 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-35 ${value && sameDay(date, selectedDate) ? 'bg-amber-400 font-bold text-slate-950' : 'text-neutral-100 hover:bg-neutral-800'}`}>{date.getDate()}</button> : <span aria-hidden="true"/>}</td>)}</tr>)}</tbody></table>
      <label className="mt-4 flex min-h-11 items-center gap-3 border-t border-neutral-700 pt-3 text-sm"><Clock size={16} className="text-neutral-400"/><span>Time</span><input type="time" aria-label={`${label} time`} value={timeValue} onChange={(event) => choose(new Date(selectedDate), event.target.value)} className="ml-auto min-h-10 rounded-lg border border-neutral-700 bg-neutral-950 px-2 text-neutral-100 focus-visible:ring-2 focus-visible:ring-amber-500"/></label>
      <button type="button" onClick={() => setOpen(false)} className="mt-3 min-h-11 w-full rounded-lg border border-neutral-600 text-sm font-semibold hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-amber-500">Done</button>
    </div>}
    {error && <p id={errorId} role="alert" aria-live="polite" className="text-xs font-medium text-rose-300">{error}</p>}
    {!error && helperText && <p className="flex items-center gap-1 text-xs text-neutral-400"><Clock size={14}/>{helperText}</p>}
  </div>;
};

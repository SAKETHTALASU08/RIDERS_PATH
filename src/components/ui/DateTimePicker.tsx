import React from 'react';
import { Calendar, Clock } from 'lucide-react';

export interface DateTimePickerProps {
  label: string;
  value: string; // ISO string or YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  id?: string;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  error,
  helperText,
  required,
  id = 'datetime-picker',
}) => {
  // Convert ISO string to local input value (YYYY-MM-DDTHH:mm)
  const formatForInput = (val: string) => {
    if (!val) return '';
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
        d.getHours()
      )}:${pad(d.getMinutes())}`;
    } catch {
      return val;
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value;
    if (!rawVal) {
      onChange('');
      return;
    }
    const d = new Date(rawVal);
    if (!isNaN(d.getTime())) {
      onChange(d.toISOString());
    } else {
      onChange(rawVal);
    }
  };

  const errorId = `${id}-error`;

  return (
    <div className="w-full flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-semibold text-neutral-300 flex items-center justify-between"
      >
        <span>
          {label}
          {required && <span className="text-amber-500 ml-1" aria-hidden="true">*</span>}
        </span>
      </label>

      <div className="relative flex items-center">
        <Calendar
          className="w-4 h-4 absolute left-3.5 text-neutral-400 pointer-events-none"
          aria-hidden="true"
        />

        <input
          id={id}
          type="datetime-local"
          value={formatForInput(value)}
          onChange={handleInputChange}
          min={min ? formatForInput(min) : undefined}
          max={max ? formatForInput(max) : undefined}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={`w-full min-h-[44px] pl-10 pr-3.5 py-2.5 rounded-xl text-sm outline-none transition-all duration-150
            bg-neutral-900 border text-neutral-100 scheme-dark
            ${
              error
                ? 'border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                : 'border-neutral-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
            }
          `}
        />
      </div>

      {error && (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs font-medium text-rose-400 mt-0.5">
          {error}
        </p>
      )}

      {!error && helperText && (
        <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" aria-hidden="true" />
          <span>{helperText}</span>
        </p>
      )}
    </div>
  );
};

import React, { forwardRef, useId } from 'react';
import { ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
  helperText?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      options,
      error,
      helperText,
      id: customId,
      disabled,
      required,
      className = '',
      containerClassName = '',
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = customId || generatedId;
    const errorId = `${id}-error`;
    const helperId = `${id}-helper`;

    return (
      <div className={`w-full flex flex-col gap-1.5 ${containerClassName}`}>
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
          <select
            ref={ref}
            id={id}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full min-h-[44px] px-3.5 py-2.5 pr-10 rounded-xl text-sm appearance-none outline-none cursor-pointer
              bg-neutral-900 border text-neutral-100 transition-all duration-150
              ${
                error
                  ? 'border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                  : 'border-neutral-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
              }
              disabled:opacity-50 disabled:bg-neutral-950 disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled} className="bg-neutral-900 text-neutral-100">
                {opt.label}
              </option>
            ))}
          </select>

          <ChevronDown
            className="w-4 h-4 absolute right-3.5 text-neutral-400 pointer-events-none"
            aria-hidden="true"
          />
        </div>

        {error && (
          <p id={errorId} role="alert" aria-live="polite" className="text-xs font-medium text-rose-400 mt-0.5">
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-neutral-400 mt-0.5">{helperText}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

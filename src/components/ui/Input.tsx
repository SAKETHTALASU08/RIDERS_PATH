import React, { forwardRef, useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      id: customId,
      disabled,
      required,
      className = '',
      containerClassName = '',
      type = 'text',
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
          {leftIcon && (
            <div className="absolute left-3.5 text-neutral-400 pointer-events-none shrink-0" aria-hidden="true">
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            type={type}
            disabled={disabled}
            required={required}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 outline-none
              bg-neutral-900 border text-neutral-100 placeholder:text-neutral-500
              ${leftIcon ? 'pl-10' : ''}
              ${rightIcon ? 'pr-10' : ''}
              ${
                error
                  ? 'border-rose-500/80 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20'
                  : 'border-neutral-800 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
              }
              disabled:opacity-50 disabled:bg-neutral-950 disabled:cursor-not-allowed
              ${className}
            `}
            {...props}
          />

          {rightIcon && (
            <div className="absolute right-3.5 text-neutral-400 shrink-0">
              {rightIcon}
            </div>
          )}
        </div>

        {error && (
          <p
            id={errorId}
            role="alert"
            aria-live="polite"
            className="text-xs font-medium text-rose-400 mt-0.5 flex items-center gap-1"
          >
            {error}
          </p>
        )}

        {!error && helperText && (
          <p id={helperId} className="text-xs text-neutral-400 mt-0.5">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

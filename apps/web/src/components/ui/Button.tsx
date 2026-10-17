import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      leftIcon,
      rightIcon,
      disabled,
      className = '',
      type = 'button',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 select-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.98]';

    const sizeStyles = {
      sm: 'min-h-[44px] px-3.5 py-2 text-xs gap-1.5',
      md: 'min-h-[44px] px-5 py-2.5 text-sm gap-2',
      lg: 'min-h-[52px] px-6 py-3.5 text-base gap-2.5',
    };

    const variantStyles = {
      primary:
        'bg-[#F97316] text-slate-950 hover:bg-[#ea580c] active:bg-[#c2410c] font-semibold shadow-md shadow-orange-500/20',
      secondary:
        'bg-[#1E293B] text-slate-100 hover:bg-[#334155] active:bg-[#1E293B] border border-slate-700/80',
      outline:
        'bg-transparent text-slate-200 border border-slate-700 hover:border-slate-500 hover:bg-[#1E293B]/70',
      ghost:
        'bg-transparent text-slate-300 hover:text-white hover:bg-slate-800/60',
      danger:
        'bg-rose-600 text-white hover:bg-rose-500 active:bg-rose-700 font-medium',
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        aria-busy={isLoading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" aria-hidden="true" />
            <span>Loading...</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0" aria-hidden="true">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0" aria-hidden="true">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';

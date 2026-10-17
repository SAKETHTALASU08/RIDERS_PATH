import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'interactive';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  className = '',
  ...props
}) => {
  const variantStyles = {
    default: 'bg-[#1E293B]/75 border border-slate-800 shadow-sm backdrop-blur-md',
    elevated: 'bg-[#1E293B] border border-slate-700/80 shadow-lg shadow-black/40',
    interactive:
      'bg-[#1E293B]/75 border border-slate-800 hover:border-orange-500/50 hover:bg-[#1E293B] transition-all duration-150 cursor-pointer backdrop-blur-md',
  };

  return (
    <div
      className={`rounded-2xl p-5 text-neutral-100 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={`mb-4 pb-3 border-b border-slate-800 flex flex-col gap-1 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <h3 className={`text-base font-bold font-heading text-[#F8FAFC] ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <p className={`text-xs text-[#E2E8F0]/80 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

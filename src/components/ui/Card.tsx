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
    default: 'bg-neutral-900/80 border border-neutral-800/80 shadow-sm',
    elevated: 'bg-neutral-900 border border-neutral-700/60 shadow-lg shadow-black/40',
    interactive:
      'bg-neutral-900/80 border border-neutral-800 hover:border-amber-500/50 hover:bg-neutral-900 transition-all duration-150 cursor-pointer',
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
  <div className={`mb-4 pb-3 border-b border-neutral-800/60 flex flex-col gap-1 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <h3 className={`text-base font-bold font-heading text-neutral-100 ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <p className={`text-xs text-neutral-400 leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

import React from 'react';
import { PackageOpen } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div
      role="region"
      aria-label={title}
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-3xl border border-dashed border-neutral-800 bg-neutral-900/30 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-neutral-800/80 flex items-center justify-center text-neutral-400 mb-4 shrink-0" aria-hidden="true">
        {icon || <PackageOpen className="w-6 h-6 text-amber-500/80" />}
      </div>

      <h3 className="text-base font-bold font-heading text-neutral-200 mb-1">
        {title}
      </h3>
      <p className="text-xs text-neutral-400 max-w-sm mb-6 leading-relaxed">
        {description}
      </p>

      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
};

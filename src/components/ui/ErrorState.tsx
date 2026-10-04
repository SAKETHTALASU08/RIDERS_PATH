import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-10 rounded-3xl border border-rose-900/40 bg-rose-950/20 text-neutral-100 ${className}`}
    >
      <div className="w-12 h-12 rounded-2xl bg-rose-950/80 border border-rose-800/80 flex items-center justify-center text-rose-400 mb-4 shrink-0" aria-hidden="true">
        <AlertTriangle className="w-6 h-6" />
      </div>

      <h3 className="text-base font-bold font-heading text-rose-200 mb-1">
        {title}
      </h3>
      <p className="text-xs text-neutral-300 max-w-sm mb-6 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Try Again
        </Button>
      )}
    </div>
  );
};

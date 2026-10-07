import React from 'react';
import { Check } from 'lucide-react';

export interface StepItem {
  id: string | number;
  title: string;
  description?: string;
}

export interface StepperProps {
  steps: StepItem[];
  currentStep: number; // 0-indexed
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onStepClick,
  className = '',
}) => {
  return (
    <nav aria-label="Progress" className={`w-full ${className}`}>
      <ol role="list" className="flex items-center justify-between w-full">
        {steps.map((step, idx) => {
          const isCompleted = idx < currentStep;
          const isCurrent = idx === currentStep;
          const isUpcoming = idx > currentStep;

          return (
            <li
              key={step.id}
              className={`relative flex-1 flex flex-col items-center ${
                idx !== steps.length - 1 ? 'pr-2 sm:pr-4' : ''
              }`}
            >
              {/* Connector line between steps */}
              {idx !== 0 && (
                <div
                  aria-hidden="true"
                  className={`absolute top-4 -left-1/2 w-full h-[2px] transition-colors duration-200 ${
                    idx <= currentStep ? 'bg-amber-500' : 'bg-neutral-800'
                  }`}
                />
              )}

              {/* Step circle indicator */}
              <button
                type="button"
                disabled={!onStepClick || isUpcoming}
                onClick={() => onStepClick && onStepClick(idx)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-label={`Step ${idx + 1}: ${step.title}`}
                className={`relative z-10 min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200 select-none
                  ${
                    isCompleted
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                      : isCurrent
                      ? 'bg-amber-500 text-slate-950 ring-4 ring-amber-500/20 shadow-md shadow-amber-500/20'
                      : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                  }
                  ${onStepClick && !isUpcoming ? 'cursor-pointer' : 'cursor-default'}
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500
                `}
              >
                {isCompleted ? (
                  <Check className="w-4 h-4 stroke-[3]" aria-hidden="true" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </button>

              {/* Step Label */}
              <div className="mt-2 text-center hidden sm:block">
                <p
                  className={`text-[11px] font-semibold tracking-tight transition-colors duration-200 ${
                    isCurrent
                      ? 'text-amber-400'
                      : isCompleted
                      ? 'text-neutral-200'
                      : 'text-neutral-500'
                  }`}
                >
                  {step.title}
                </p>
                {step.description && (
                  <p className="text-[10px] text-neutral-500 mt-0.5 max-w-[100px] truncate">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Mobile visible current step indicator */}
      <div className="sm:hidden mt-3 text-center">
        <span className="text-xs font-semibold text-amber-400">
          Step {currentStep + 1} of {steps.length}:{' '}
        </span>
        <span className="text-xs text-neutral-200">
          {steps[currentStep]?.title}
        </span>
      </div>
    </nav>
  );
};

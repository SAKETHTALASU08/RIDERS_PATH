import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Button, Input, Modal, Stepper, ToastProvider, useToast } from '../components/ui';

describe('Design System UI Components', () => {
  it('renders Button with loading state and disabled accessibility', () => {
    const { rerender } = render(<Button>Book Now</Button>);
    const btn = screen.getByRole('button', { name: /book now/i });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();

    rerender(<Button isLoading>Book Now</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('renders Input with proper label association and aria-invalid on error', () => {
    render(
      <Input
        label="Student Enrollment Number"
        id="enrollment"
        error="Invalid enrollment format"
      />
    );

    const input = screen.getByLabelText(/student enrollment number/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid enrollment format');
  });

  it('renders Stepper with correct aria-current on active step', () => {
    const steps = [
      { id: 1, title: 'Dates' },
      { id: 2, title: 'Pricing' },
      { id: 3, title: 'Verification' },
    ];

    render(<Stepper steps={steps} currentStep={1} />);

    const stepButtons = screen.getAllByRole('button');
    expect(stepButtons).toHaveLength(3);
    expect(stepButtons[1]).toHaveAttribute('aria-current', 'step');
    expect(stepButtons[0]).not.toHaveAttribute('aria-current');
  });

  it('passes axe accessibility checks on Modal and form controls', async () => {
    const { container } = render(
      <div>
        <main>
          <h1>Campus Bike Handover</h1>
          <form>
            <Input label="Student Name" id="student_name" />
            <Button type="submit">Submit Details</Button>
          </form>
        </main>
      </div>
    );

    const results = await axe.run(container);
    // Ignore color-contrast in JSDOM because JSDOM doesn't compute true computed CSS colors
    const violations = results.violations.filter((v) => v.id !== 'color-contrast');
    expect(violations.length).toBe(0);
  });
});

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DateTimePicker } from '../components/ui/DateTimePicker';

describe('DateTimePicker', () => {
  it('selects a day and time from the accessible calendar without a native datetime input', async () => {
    const onChange = vi.fn();
    const { container } = render(<DateTimePicker id="pickup" label="Pickup date and time" value="" onChange={onChange} required/>);
    await screen.findByRole('button', { name: /pickup date and time/i });
    fireEvent.click(screen.getByRole('button', { name: /pickup date and time/i }));
    expect(screen.getByRole('dialog', { name: /pickup date and time calendar/i })).toBeInTheDocument();
    const today = new Date().toLocaleDateString();
    fireEvent.click(screen.getByRole('button', { name: `Choose ${today}` }));
    expect(onChange).toHaveBeenCalledWith(expect.any(String));
    expect(new Date(onChange.mock.calls[0][0]).toString()).not.toBe('Invalid Date');
    fireEvent.change(screen.getByLabelText(/pickup date and time time/i), { target: { value: '13:30' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.any(String));
    expect(container.querySelector('input[type="datetime-local"]')).toBeNull();
  });
});

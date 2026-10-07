import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { BookingFlowPage } from '../pages/BookingFlowPage';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../components/ui/Toast';

describe('Booking Stepper Flow & Validation', () => {
  it('shows field-level validation and keeps the selected dates when the range is invalid', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/book/bike-ather-450x']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/book/:id" element={<BookingFlowPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await screen.findByText(/Ather 450X Gen 3/i);
    const returnInput = screen.getByLabelText(/return date & time/i) as HTMLInputElement;
    fireEvent.change(returnInput, { target: { value: '2020-01-01T10:00' } });
    await user.click(screen.getByRole('button', { name: /compute server pricing/i }));

    expect(returnInput).toHaveAttribute('aria-invalid', 'true');
    expect(returnInput).toHaveValue('2020-01-01T10:00');
    expect(screen.getByText('Return time must be later than pickup time.')).toBeInTheDocument();
    expect(screen.getByText('Review the highlighted booking details.')).toBeInTheDocument();
  });

  it('renders booking stepper and advances to server pricing calculation', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/book/bike-ather-450x']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/book/:id" element={<BookingFlowPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    // Verify bike details loaded
    expect(await screen.findByText(/Ather 450X Gen 3/i)).toBeInTheDocument();

    // Verify deposit modes available
    expect(screen.getByText(/Working Laptop Deposit/i)).toBeInTheDocument();
    expect(screen.getByText(/Campus Hub Security Deposit/i)).toBeInTheDocument();

    // Advance to Step 2
    const computeBtn = screen.getByRole('button', { name: /compute server pricing/i });
    await user.click(computeBtn);

    // Wait for server-calculated pricing breakdown
    expect(await screen.findByText(/transparent pricing breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/total payable at handover/i)).toBeInTheDocument();
    expect(screen.getByText(/pay at campus handover/i)).toBeInTheDocument();
  });

  it('guarantees NO Aadhaar fields exist in verification step', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={['/book/bike-ather-450x']}>
        <ToastProvider>
          <AuthProvider>
            <Routes>
              <Route path="/book/:id" element={<BookingFlowPage />} />
            </Routes>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );

    await screen.findByText(/Ather 450X Gen 3/i);
    await user.click(screen.getByRole('button', { name: /compute server pricing/i }));
    await screen.findByText(/transparent pricing breakdown/i);

    // Advance to document upload
    await user.click(screen.getByRole('button', { name: /confirm & upload ids/i }));

    expect(await screen.findByText(/student driving clearance & id upload/i)).toBeInTheDocument();

    // Ensure Driving Licence and Student ID are present
    expect(screen.getByText(/two-wheeler driving licence/i)).toBeInTheDocument();
    expect(screen.getAllByText(/icfai student id card/i).length).toBeGreaterThan(0);

    // STRICT CHECK: Ensure NO Aadhaar input, label, or upload field exists
    expect(screen.queryByLabelText(/aadhaar/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/aadhaar/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /aadhaar/i })).not.toBeInTheDocument();
  });
});

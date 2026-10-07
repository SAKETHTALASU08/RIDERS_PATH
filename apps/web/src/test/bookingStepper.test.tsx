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
    const returnInput = screen.getByRole('button', { name: /return date and time/i });
    await user.click(returnInput);
    const pickupDay = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString();
    await user.click(screen.getByRole('button', { name: `Choose ${pickupDay}` }));
    fireEvent.change(screen.getByLabelText(/return date and time time/i), { target: { value: '00:00' } });
    await user.click(screen.getByRole('button', { name: 'Done' }));
    await user.click(screen.getByRole('button', { name: /check availability and price/i }));

    expect(returnInput).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Return must be later than pickup.')).toBeInTheDocument();
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
    const computeBtn = screen.getByRole('button', { name: /check availability and price/i });
    await user.click(computeBtn);

    // Wait for server-calculated pricing breakdown
    expect(await screen.findByText(/price calculated by the server/i)).toBeInTheDocument();
    expect(screen.getByText(/total payable at handover/i)).toBeInTheDocument();
    expect(screen.getByText(/payment is collected at handover/i)).toBeInTheDocument();
  });

  it('keeps the terms step locked until consent and each required document exist', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/book/bike-ather-450x']}>
        <ToastProvider><AuthProvider><Routes><Route path="/book/:id" element={<BookingFlowPage />} /></Routes></AuthProvider></ToastProvider>
      </MemoryRouter>
    );

    await screen.findByText(/Ather 450X Gen 3/i);
    await user.click(screen.getByRole('button', { name: /check availability and price/i }));
    await screen.findByText(/price calculated by the server/i);
    await user.click(screen.getByRole('button', { name: /continue to documents/i }));

    await user.click(screen.getByRole('button', { name: /continue to terms/i }));
    expect(screen.getByText('Upload every required document before continuing.')).toBeInTheDocument();
    expect(screen.queryByText(/review and send booking request/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /i have read this notice/i }));
    await user.click(screen.getByRole('button', { name: /agree and continue to upload/i }));
    await user.click(screen.getByRole('button', { name: /continue to terms/i }));
    expect(screen.getByText('Upload every required document before continuing.')).toBeInTheDocument();
    expect(screen.queryByText(/review and send booking request/i)).not.toBeInTheDocument();
  });

  it('shows the required Aadhaar field and the masking reminder when enabled by public config', async () => {
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
    await user.click(screen.getByRole('button', { name: /check availability and price/i }));
    await screen.findByText(/price calculated by the server/i);

    // Advance to document upload
    await user.click(screen.getByRole('button', { name: /continue to documents/i }));

    expect(await screen.findByText(/documents for team review/i)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /i have read this notice/i }));
    await user.click(screen.getByRole('button', { name: /agree and continue to upload/i }));
    expect(await screen.findByText(/aadhaar upload reminder/i)).toBeInTheDocument();
    expect(screen.getAllByText(/two-wheeler driving licence/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/college student id/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/aadhaar/i).length).toBeGreaterThan(0);
  });
});

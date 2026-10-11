import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthModal } from '../components/auth/AuthModal';
import { AuthProvider, useAuth } from '../context/AuthContext';

import { ToastProvider } from '../components/ui/Toast';

// Helper component to trigger opening the modal
const TestAuthTrigger = () => {
  const { openAuthModal } = useAuth();
  return <button onClick={openAuthModal}>Open Auth</button>;
};

describe('OTP Input & Authentication Flow', () => {
  it('accepts a pasted six-digit code and advances to profile completion', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AuthProvider>
          <TestAuthTrigger />
          <AuthModal />
        </AuthProvider>
      </ToastProvider>
    );

    await user.click(screen.getByText('Open Auth'));
    await user.type(screen.getByLabelText(/email address/i), `new.student+${Date.now()}@student.example.edu`);
    await user.click(screen.getByRole('button', { name: /send verification code/i }));
    await screen.findByLabelText('Digit 1 of 6');
    screen.getByLabelText('Digit 1 of 6').focus();
    await user.paste('123456');

    expect(await screen.findByText(/complete student profile/i)).toBeInTheDocument();
  });

  it('accepts a personal email and shows the verification-code step', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <AuthProvider>
          <TestAuthTrigger />
          <AuthModal />
        </AuthProvider>
      </ToastProvider>
    );

    // Open modal
    await user.click(screen.getByText('Open Auth'));

    const emailInput = screen.getByLabelText(/email address/i);
    const submitBtn = screen.getByRole('button', { name: /send verification code/i });

    await user.type(emailInput, 'student@gmail.com');
    await user.click(submitBtn);

    expect(await screen.findByText(/enter 6-digit code/i)).toBeInTheDocument();
    // Verify six OTP input boxes after the generic response.
    const digitInputs = screen.getAllByRole('textbox');
    expect(digitInputs).toHaveLength(6);
  });
});

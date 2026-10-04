import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthModal } from '../components/auth/AuthModal';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { PLATFORM_CONFIG } from '../config/platform.config';

import { ToastProvider } from '../components/ui/Toast';

// Helper component to trigger opening the modal
const TestAuthTrigger = () => {
  const { openAuthModal } = useAuth();
  return <button onClick={openAuthModal}>Open Auth</button>;
};

describe('OTP Input & Authentication Flow', () => {
  it('validates university domain email and rejects non-college emails', async () => {
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

    const emailInput = screen.getByLabelText(/college email address/i);
    const submitBtn = screen.getByRole('button', { name: /send verification code/i });

    // Try submitting with a generic email
    await user.type(emailInput, 'student@gmail.com');
    await user.click(submitBtn);

    expect(
      await screen.findByText(new RegExp(`@${PLATFORM_CONFIG.allowedEmailDomain}`, 'i'))
    ).toBeInTheDocument();
  });

  it('accepts valid ICFAI email and transitions to 6-digit OTP screen', async () => {
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
    const emailInput = screen.getByLabelText(/college email address/i);
    const submitBtn = screen.getByRole('button', { name: /send verification code/i });

    await user.clear(emailInput);
    await user.type(emailInput, `rohit@${PLATFORM_CONFIG.allowedEmailDomain}`);
    await user.click(submitBtn);

    // Should transition to Enter 6-Digit Code
    expect(await screen.findByText(/enter 6-digit code/i)).toBeInTheDocument();

    // Verify 6 input boxes for digits
    const digitInputs = screen.getAllByRole('textbox');
    expect(digitInputs).toHaveLength(6);
  });
});

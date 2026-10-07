import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  it('keeps domain eligibility server-side and shows a generic next step', async () => {
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

    // The browser does not reveal whether the address is on the server allowlist.
    await user.type(emailInput, 'student@gmail.com');
    await user.click(submitBtn);

    expect(await screen.findByText(/enter 6-digit code/i)).toBeInTheDocument();
    // Verify six OTP input boxes after the generic response.
    const digitInputs = screen.getAllByRole('textbox');
    expect(digitInputs).toHaveLength(6);
  });
});

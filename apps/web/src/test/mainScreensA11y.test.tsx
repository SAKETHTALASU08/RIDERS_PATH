import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import axe from 'axe-core';
import { LandingPage } from '../pages/LandingPage';
import { BrowseBikesPage } from '../pages/BrowseBikesPage';
import { BookingFlowPage } from '../pages/BookingFlowPage';
import { OwnerOnboardPage } from '../pages/OwnerOnboardPage';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';

afterEach(cleanup);

async function expectAccessible(container: HTMLElement) {
  const results = await axe.run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  });
  // JSDOM does not compute real rendered colors, so contrast is verified outside this unit test.
  expect(results.violations.filter((violation) => violation.id !== 'color-contrast')).toEqual([]);
}

function renderPage(element: React.ReactNode, initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ToastProvider>
        <AuthProvider>
          <main>{element}</main>
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('Main screen accessibility', () => {
  it('passes axe checks on the landing page', async () => {
    const { container } = renderPage(<LandingPage />, '/');
    await expectAccessible(container);
  });

  it('passes axe checks on the loaded bike catalog', async () => {
    const { container } = renderPage(<BrowseBikesPage />, '/browse');
    expect(await screen.findByText(/Ather 450X Gen 3/i)).toBeInTheDocument();
    await expectAccessible(container);
  });

  it('passes axe checks on booking and owner forms', async () => {
    const booking = render(
      <MemoryRouter initialEntries={['/book/bike-ather-450x']}>
        <ToastProvider>
          <AuthProvider>
            <main>
              <Routes><Route path="/book/:id" element={<BookingFlowPage />} /></Routes>
            </main>
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(await screen.findByText(/choose rental duration & pickup hub/i)).toBeInTheDocument();
    await expectAccessible(booking.container);

    cleanup();
    const { container } = renderPage(<OwnerOnboardPage />, '/owner');
    expect(await screen.findByText(/list your two-wheeler/i)).toBeInTheDocument();
    await expectAccessible(container);
  });
});

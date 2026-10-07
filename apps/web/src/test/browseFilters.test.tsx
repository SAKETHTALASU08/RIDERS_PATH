import React from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { BrowseBikesPage } from '../pages/BrowseBikesPage';
import { ToastProvider } from '../components/ui/Toast';
import { AuthProvider } from '../context/AuthContext';

function CurrentSearch() {
  const location = useLocation();
  return <output data-testid="location-search">{location.search}</output>;
}

describe('browse filters and URL state', () => {
  it('loads filters from the URL and writes changes back without a page reload', async () => {
    render(<MemoryRouter initialEntries={['/browse?fuel=electric']}><ToastProvider><AuthProvider><CurrentSearch/><BrowseBikesPage/></AuthProvider></ToastProvider></MemoryRouter>);
    expect(await screen.findByText(/Ather 450X Gen 3/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Fuel')).toHaveValue('electric');
    fireEvent.change(screen.getByLabelText('Bike type'), { target: { value: 'scooter' } });
    await waitFor(() => expect(screen.getByTestId('location-search')).toHaveTextContent(/fuel=electric.*type=scooter|type=scooter.*fuel=electric/));
  });

  it('optimistically saves a bike and confirms the action', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/browse']}><ToastProvider><AuthProvider><BrowseBikesPage/></AuthProvider></ToastProvider></MemoryRouter>);
    expect(await screen.findByText(/Ather 450X Gen 3/i)).toBeInTheDocument();
    const saveButton = screen.getByRole('button', { name: /save Ather 450X Gen 3/i });
    await user.click(saveButton);
    expect(saveButton).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText('Bike saved')).toBeInTheDocument();
  });

});

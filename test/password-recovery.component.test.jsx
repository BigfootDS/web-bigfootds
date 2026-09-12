import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import BrowserAuthSessionPanel from '../src/components/BrowserAuthSessionPanel.jsx';
import PasswordResetPanel from '../src/components/PasswordResetPanel.jsx';
import PasswordResetRequestPanel from '../src/components/PasswordResetRequestPanel.jsx';

const apiBaseUrl = 'https://auth.bigfootds.dev';
const resetToken = 'Z5DRSZ6F_6L_6QHvKK90IxLYyMQp0p6pK8pocnSoD2A';

test('keeps the password-reset request response generic and sends no browser session', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 202 })));
  render(<PasswordResetRequestPanel apiBaseUrl={apiBaseUrl} />);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email password-reset link' }));

  expect(await screen.findByText('If an eligible account uses that email, password reset instructions will be sent.')).toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = fetch.mock.calls[0];
  expect(url.href).toBe('https://auth.bigfootds.dev/v1/users/public/password-reset-requests');
  expect(JSON.parse(init.body)).toEqual({ email: 'player@example.com' });
  expect(init.credentials).toBe('omit');
  expect(init.referrerPolicy).toBe('no-referrer');
  expect(init.headers.Authorization).toBeUndefined();
  expect(init.headers.accessToken).toBeUndefined();
  expect(init.headers.refreshToken).toBeUndefined();
});

test('maps a reset-request rejection to safe validation copy without server detail', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private account detail', { status: 400 })));
  render(<PasswordResetRequestPanel apiBaseUrl={apiBaseUrl} />);

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Email password-reset link' }));

  expect(await screen.findByText('Enter a valid email address and try again.')).toBeTruthy();
  expect(screen.queryByText('private account detail')).toBeNull();
});

test('strips a valid reset fragment before rendering and keeps it out of UI text', async () => {
  window.history.replaceState(null, '', `/account/reset-password/#token=${resetToken}`);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200 })));
  render(<PasswordResetPanel apiBaseUrl={apiBaseUrl} />);

  expect(window.location.hash).toBe('');
  expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeTruthy();
  expect(document.body.textContent).not.toContain(resetToken);

  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-not-a-real-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'does-not-match' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect(await screen.findByText('Enter a new password and a matching confirmation.')).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-not-a-real-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  expect(await screen.findByRole('heading', { name: 'Password reset complete' })).toBeTruthy();

  const [url, init] = fetch.mock.calls[0];
  expect(url.href).toBe('https://auth.bigfootds.dev/v1/users/public/password-resets');
  expect(JSON.parse(init.body)).toEqual({ password: 'new-not-a-real-password', token: resetToken });
  expect(init.credentials).toBe('omit');
  expect(init.referrerPolicy).toBe('no-referrer');
  expect(document.body.textContent).not.toContain(resetToken);
});

test('offers a recovery link from the signed-out sign-in controls', async () => {
  render(<BrowserAuthSessionPanel apiBaseUrl={apiBaseUrl} />);

  const link = await screen.findByRole('link', { name: 'Forgot your password?' });
  expect(link.getAttribute('href')).toBe('/account/forgot-password/');
});

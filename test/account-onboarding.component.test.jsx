import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AccountRegistrationPanel from '../src/components/AccountRegistrationPanel.jsx';
import EmailVerificationPanel from '../src/components/EmailVerificationPanel.jsx';
import AccountHub from '../src/components/AccountHub.jsx';
import PasswordResetRequestPanel from '../src/components/PasswordResetRequestPanel.jsx';
import PasswordResetPanel from '../src/components/PasswordResetPanel.jsx';
import { BROWSER_AUTH_SESSION_STORAGE_KEY } from '../src/lib/browser-auth-session.mjs';

const apiBaseUrl = 'https://auth.example.test';
const accountsBaseUrl = 'https://accounts.example.test';
const email = 'player@example.test';
const password = 'ExamplePassword1';

test('completes signup, verification, sign-in, profile creation/editing and recovery against deterministic contracts', async () => {
  let profile;
  const requests = [];
  const code = 'a012bcde';
  const resetToken = 'A'.repeat(43);
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    requests.push({ url, init });
    const body = init.body ? JSON.parse(init.body) : undefined;
    if (url.pathname.endsWith('/register')) return json({ accessToken: 'signup.discarded', refreshToken: 'signup.discarded' });
    if (url.pathname.endsWith('/emailVerification')) {
      expect(body).toEqual({ code });
      return json({ message: 'Email verified successfully.' });
    }
    if (url.pathname.endsWith('/login')) return json({ accessToken: 'access.current', refreshToken: 'refresh.current' });
    if (url.pathname.endsWith('/verify')) return json({ accessToken: 'access.renewed' });
    if (url.origin === accountsBaseUrl) {
      if (init.method === 'GET') return profile ? json(profile) : new Response(null, { status: 404 });
      profile = { biography: '', nameplate: '', tag: '', socialLinks: [], ...profile, ...body };
      return json(profile);
    }
    if (url.pathname.endsWith('/password-reset-requests')) return new Response(null, { status: 202 });
    if (url.pathname.endsWith('/password-resets')) {
      expect(body.token).toBe(resetToken);
      return new Response(null, { status: 200 });
    }
    throw new Error('Unexpected fixture request');
  }));

  let view = render(<AccountRegistrationPanel apiBaseUrl={apiBaseUrl} />);
  fillRegistration();
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByRole('heading', { name: 'Check your email' });
  expect(window.localStorage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY)).toBeNull();
  expect(screen.getByRole('link', { name: 'Verify your email address' }).getAttribute('href')).toBe('/account/verify-email/');
  view.unmount();

  view = render(<EmailVerificationPanel apiBaseUrl={apiBaseUrl} />);
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: code } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByRole('heading', { name: 'Email verified' });
  expect(window.localStorage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY)).toBeNull();
  expect(document.body.textContent).not.toContain(code);
  view.unmount();

  view = render(<AccountHub accountsBaseUrl={accountsBaseUrl} authBaseUrl={apiBaseUrl} />);
  await screen.findByRole('button', { name: 'Sign in' });
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByRole('heading', { name: 'Create your profile' });
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Fixture Player' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create profile' }));
  await screen.findByRole('heading', { name: 'Your profile' });
  fireEvent.change(screen.getByLabelText('Biography'), { target: { value: 'Fixture biography' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(profile.biography).toBe('Fixture biography'));
  expect(JSON.parse(window.localStorage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY)))
    .toEqual({ accessToken: 'access.renewed', refreshToken: 'refresh.current' });
  fireEvent.click(screen.getByRole('button', { name: 'Sign out on this browser' }));
  await screen.findByRole('button', { name: 'Sign in' });
  expect(window.localStorage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY)).toBeNull();
  view.unmount();

  view = render(<PasswordResetRequestPanel apiBaseUrl={apiBaseUrl} />);
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: 'Email password-reset link' }));
  await screen.findByText('If an eligible account uses that email, password reset instructions will be sent.');
  view.unmount();
  window.history.replaceState(null, '', `/account/reset-password/#token=${resetToken}`);
  view = render(<PasswordResetPanel apiBaseUrl={apiBaseUrl} />);
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));
  await screen.findByRole('heading', { name: 'Password reset complete' });
  expect(window.location.hash).toBe('');
  expect(window.localStorage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY)).toBeNull();
  for (const { url, init } of requests) {
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(init.credentials).toBe('omit');
    expect(init.cache).toBe('no-store');
  }
});

test('prevents duplicate pending signup, clears the form and does not store signup tokens', async () => {
  let finish;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finish = resolve; })));
  render(<AccountRegistrationPanel apiBaseUrl={apiBaseUrl} />);
  fillRegistration();
  const form = screen.getByRole('button', { name: 'Create account' }).closest('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Password').closest('fieldset').disabled).toBe(true);
  finish(json({ accessToken: 'discard', refreshToken: 'discard' }));
  await screen.findByRole('heading', { name: 'Check your email' });
  expect(screen.queryByDisplayValue(password)).toBeNull();
  expect(window.localStorage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY)).toBeNull();
});

test('keeps signup validation local and renders neutral rejection copy', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('private-provider-detail', { status: 400 })));
  render(<AccountRegistrationPanel apiBaseUrl={apiBaseUrl} />);
  fillRegistration('different');
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText(/matching confirmation/);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await screen.findByText(/We could not create your account/);
  expect(document.body.textContent).not.toContain('private-provider-detail');
});

test('allows retry after verification rejection or unavailability without exposing the response', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(new Response('private-detail', { status: 401 }))
    .mockRejectedValueOnce(new Error('private-network-detail'))
    .mockResolvedValueOnce(json({ message: 'Email verified successfully.' })));
  render(<EmailVerificationPanel apiBaseUrl={apiBaseUrl} />);
  fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: 'a012bcde' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByText(/That code could not be verified/);
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByText(/unavailable right now/);
  fireEvent.click(screen.getByRole('button', { name: 'Verify email' }));
  await screen.findByRole('heading', { name: 'Email verified' });
  expect(document.body.textContent).not.toContain('private-detail');
  expect(document.body.textContent).not.toContain('private-network-detail');
});

test('keeps unconfigured onboarding unavailable and sends no request', () => {
  vi.stubGlobal('fetch', vi.fn());
  const view = render(<AccountRegistrationPanel />);
  expect(screen.getByRole('heading', { name: 'Account creation unavailable' })).toBeTruthy();
  view.unmount();
  render(<EmailVerificationPanel />);
  expect(screen.getByRole('heading', { name: 'Email verification unavailable' })).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
});

function fillRegistration(confirmation = password) {
  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } });
}
function json(body) { return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }); }

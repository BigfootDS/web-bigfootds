import { useEffect, useState } from 'react';

import {
  BrowserAuthSessionError,
  clearStoredBrowserAuthSession,
  signInBrowserAuthSession,
  verifyStoredBrowserAuthSession
} from '../lib/browser-auth-session.mjs';
import '../styles/browser-auth-session.css';

const initialStatus = { message: 'Checking this browser session…', state: 'loading' };

/**
 * Lets a visitor establish and manage the direct MS-Auth browser session.
 *
 * This component never displays raw authentication errors, does not store a
 * password in React state, and only reads browser storage after hydration.
 * Its API origin is deliberately public build configuration; credentials and
 * token material are never part of the page's static HTML.
 *
 * When the browser session becomes usable or is removed, `onSessionChange`
 * lets an adjacent account feature re-read its own service data. The callback
 * receives no token, user ID, password or server response.
 *
 * @param {{ apiBaseUrl?: string, onSessionChange?: (state: 'signed-in' | 'signed-out' | 'unavailable') => void }} props Public MS-Auth origin and safe state-change callback.
 * @returns {import('react').ReactNode} Account session controls.
 */
export default function BrowserAuthSessionPanel({ apiBaseUrl, onSessionChange }) {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    void checkSession();

    async function checkSession() {
      if (!apiBaseUrl) {
        setStatus({
          message: 'Account sign-in is not available in this deployment yet.',
          state: 'unavailable'
        });
        onSessionChange?.('unavailable');
        return;
      }

      try {
        const session = await verifyStoredBrowserAuthSession({
          apiBaseUrl,
          storage: window.localStorage
        });
        const nextStatus = session === undefined
          ? { message: 'Sign in to use account features as they become available.', state: 'signed-out' }
          : { message: 'You are signed in on this browser.', state: 'signed-in' };
        setStatus(nextStatus);
        onSessionChange?.(nextStatus.state);
      } catch (error) {
        const nextStatus = statusForError(error, 'verify');
        setStatus(nextStatus);
        onSessionChange?.(nextStatus.state);
      }
    }
  }, [apiBaseUrl, onSessionChange]);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!apiBaseUrl) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus({ message: 'Signing in…', state: 'loading' });

    try {
      await signInBrowserAuthSession({
        apiBaseUrl,
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        storage: window.localStorage
      });
      form.reset();
      setStatus({ message: 'You are signed in on this browser.', state: 'signed-in' });
      onSessionChange?.('signed-in');
    } catch (error) {
      setStatus(statusForError(error, 'sign-in'));
    }
  }

  function handleSignOut() {
    try {
      clearStoredBrowserAuthSession(window.localStorage);
      setStatus({ message: 'You have been signed out on this browser.', state: 'signed-out' });
      onSessionChange?.('signed-out');
    } catch (error) {
      setStatus(statusForError(error, 'sign-out'));
    }
  }

  if (status.state === 'loading') {
    return <p className="browser-auth-status" aria-live="polite">{status.message}</p>;
  }

  if (status.state === 'signed-in') {
    return (
      <section className="browser-auth-panel" aria-labelledby="account-session-heading">
        <h2 id="account-session-heading">Account session</h2>
        <p className="browser-auth-status" aria-live="polite">{status.message}</p>
        <p>Connected account features will appear here as each service is added.</p>
        <button type="button" onClick={handleSignOut}>Sign out on this browser</button>
      </section>
    );
  }

  if (status.state === 'unavailable') {
    return (
      <section className="browser-auth-panel" aria-labelledby="account-session-heading">
        <h2 id="account-session-heading">Account sign-in unavailable</h2>
        <p className="browser-auth-status" aria-live="polite">{status.message}</p>
        <p>Public pages, news and events remain available without signing in.</p>
      </section>
    );
  }

  return (
    <section className="browser-auth-panel" aria-labelledby="account-session-heading">
      <h2 id="account-session-heading">Sign in</h2>
      <p className="browser-auth-status" aria-live="polite">{status.message}</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="account-email">Email address</label>
        <input id="account-email" name="email" type="email" autoComplete="email" required />

        <label htmlFor="account-password">Password</label>
        <input
          id="account-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck="false"
          required
        />

        <button type="submit">Sign in</button>
      </form>
      <p><a href="/account/forgot-password/">Forgot your password?</a></p>
      <p><a href="/account/register/">Create an account</a> or <a href="/account/verify-email/">verify your email address</a>.</p>
    </section>
  );
}

function statusForError(error, action) {
  if (!(error instanceof BrowserAuthSessionError)) {
    return { message: 'Account sign-in is not available right now. Please try again later.', state: 'unavailable' };
  }

  if (error.kind === 'verification-required') {
    return { message: 'Verify your email before signing in. Use the verification page to enter or request a new code.', state: 'signed-out' };
  }

  if (error.kind === 'rejected') {
    return action === 'verify'
      ? { message: 'Your previous sign-in has ended. Please sign in again.', state: 'signed-out' }
      : { message: 'We could not sign you in. Check your details and try again.', state: 'signed-out' };
  }

  if (error.kind === 'validation') {
    return { message: 'Enter an email address and password, then try again.', state: 'signed-out' };
  }

  if (error.kind === 'storage') {
    return { message: 'This browser is not allowing account storage.', state: 'unavailable' };
  }

  return { message: 'Account sign-in is not available right now. Please try again later.', state: 'unavailable' };
}

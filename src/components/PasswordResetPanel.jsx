import { useState } from 'react';

import { BrowserAuthSessionError } from '../lib/browser-auth-session.mjs';
import {
  PasswordRecoveryError,
  completePasswordReset,
  consumePasswordResetTokenFromFragment
} from '../lib/password-recovery.mjs';
import '../styles/password-recovery.css';

/**
 * Lets a visitor choose a new password after consuming a fragment-only reset
 * token. The token is removed from the address bar as this client-only island
 * starts and is then held solely in React memory until it is redeemed or the
 * page is left.
 *
 * @param {{ apiBaseUrl?: string }} props Public MS-Auth origin.
 * @returns {import('react').ReactNode} Password reset completion form or safe link state.
 */
export default function PasswordResetPanel({ apiBaseUrl }) {
  const [resetToken, setResetToken] = useState(readFragmentToken);
  const [status, setStatus] = useState({ message: '', state: 'ready' });

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get('password') ?? '');
    const passwordConfirmation = String(formData.get('passwordConfirmation') ?? '');

    if (!password || password !== passwordConfirmation) {
      setStatus({ message: 'Enter a new password and a matching confirmation.', state: 'ready' });
      return;
    }

    setStatus({ message: 'Saving your new password…', state: 'loading' });
    try {
      await completePasswordReset({ apiBaseUrl, password, token: resetToken });
      form.reset();
      setResetToken(undefined);
      setStatus({
        message: 'Your password has been reset. You can now sign in with your new password.',
        state: 'succeeded'
      });
    } catch (error) {
      setStatus(statusForError(error));
    }
  }

  if (status.state === 'succeeded') {
    return (
      <section className="password-recovery-panel" aria-labelledby="reset-password-heading">
        <h1 id="reset-password-heading">Password reset complete</h1>
        <p className="password-recovery-status" aria-live="polite">{status.message}</p>
        <p><a href="/account/">Return to sign in</a></p>
      </section>
    );
  }

  if (!resetToken) {
    return (
      <section className="password-recovery-panel" aria-labelledby="reset-password-heading">
        <h1 id="reset-password-heading">Request a new reset link</h1>
        <p>This password-reset link is missing or invalid. Request a new link to continue.</p>
        <p><a href="/account/forgot-password/">Request a password-reset link</a></p>
      </section>
    );
  }

  return (
    <section className="password-recovery-panel" aria-labelledby="reset-password-heading">
      <h1 id="reset-password-heading">Choose a new password</h1>
      <p>Choose a new password for your BigfootDS account.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="new-password">New password</label>
        <input
          id="new-password"
          name="password"
          type="password"
          autoComplete="new-password"
          autoCapitalize="none"
          maxLength="1024"
          spellCheck="false"
          required
        />
        <label htmlFor="new-password-confirmation">Confirm new password</label>
        <input
          id="new-password-confirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          autoCapitalize="none"
          maxLength="1024"
          spellCheck="false"
          required
        />
        <button type="submit" disabled={status.state === 'loading'}>
          {status.state === 'loading' ? 'Saving password…' : 'Save new password'}
        </button>
      </form>
      <p className="password-recovery-status" aria-live="polite">{status.message}</p>
    </section>
  );
}

function readFragmentToken() {
  if (typeof window === 'undefined') return undefined;

  return consumePasswordResetTokenFromFragment({
    history: window.history,
    location: window.location
  });
}

function statusForError(error) {
  if (error instanceof PasswordRecoveryError && error.kind === 'validation') {
    return { message: 'Enter a new password and a matching confirmation.', state: 'ready' };
  }

  if (error instanceof PasswordRecoveryError && error.kind === 'rejected') {
    return {
      message: 'We could not reset your password. Check your new password and try again, or request a new link.',
      state: 'ready'
    };
  }

  if (error instanceof BrowserAuthSessionError || error instanceof PasswordRecoveryError) {
    return { message: 'Password reset is not available right now. Please try again later.', state: 'unavailable' };
  }

  return { message: 'Password reset is not available right now. Please try again later.', state: 'unavailable' };
}

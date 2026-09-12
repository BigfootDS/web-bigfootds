import { useState } from 'react';

import { BrowserAuthSessionError } from '../lib/browser-auth-session.mjs';
import { PasswordRecoveryError, requestPasswordReset } from '../lib/password-recovery.mjs';
import '../styles/password-recovery.css';

const acceptedMessage = 'If an eligible account uses that email, password reset instructions will be sent.';

/**
 * Provides the anonymous entry point for requesting password-reset email.
 *
 * The email value stays in the form DOM rather than React state, and every
 * valid-shaped request uses the same accepted copy. That prevents the website
 * from becoming an account-existence oracle.
 *
 * @param {{ apiBaseUrl?: string }} props Public MS-Auth origin.
 * @returns {import('react').ReactNode} Password reset request form.
 */
export default function PasswordResetRequestPanel({ apiBaseUrl }) {
  const [status, setStatus] = useState({ message: '', state: 'ready' });

  async function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setStatus({ message: 'Requesting password reset instructions…', state: 'loading' });

    try {
      await requestPasswordReset({
        apiBaseUrl,
        email: String(formData.get('email') ?? '')
      });
      form.reset();
      setStatus({ message: acceptedMessage, state: 'accepted' });
    } catch (error) {
      setStatus(statusForError(error));
    }
  }

  return (
    <section className="password-recovery-panel" aria-labelledby="forgot-password-heading">
      <h1 id="forgot-password-heading">Reset your password</h1>
      <p>Enter your account email address and we will send a password-reset link if it is eligible.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="password-reset-email">Email address</label>
        <input
          id="password-reset-email"
          name="email"
          type="email"
          autoComplete="email"
          maxLength="320"
          required
        />
        <button type="submit" disabled={status.state === 'loading'}>
          {status.state === 'loading' ? 'Requesting link…' : 'Email password-reset link'}
        </button>
      </form>
      <p className="password-recovery-status" aria-live="polite">{status.message}</p>
      <p><a href="/account/">Return to sign in</a></p>
    </section>
  );
}

function statusForError(error) {
  if (error instanceof PasswordRecoveryError && error.kind === 'validation') {
    return { message: 'Enter a valid email address and try again.', state: 'ready' };
  }

  if (error instanceof PasswordRecoveryError && error.kind === 'rejected') {
    return { message: 'Enter a valid email address and try again.', state: 'ready' };
  }

  if (error instanceof BrowserAuthSessionError || error instanceof PasswordRecoveryError) {
    return { message: 'Password reset is not available right now. Please try again later.', state: 'unavailable' };
  }

  return { message: 'Password reset is not available right now. Please try again later.', state: 'unavailable' };
}

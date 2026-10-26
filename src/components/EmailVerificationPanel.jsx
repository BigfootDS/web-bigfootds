import { useRef, useState } from 'react';
import { AccountOnboardingError, verifyWebsiteEmail } from '../lib/account-onboarding.mjs';
import '../styles/browser-auth-session.css';

/**
 * Accepts the existing signup email's code as manual input. It never reads a
 * capability from location or browser storage, and success does not sign in.
 * @param {{ apiBaseUrl?: string }} props Public MS-Auth origin.
 * @returns {import('react').ReactNode} Code form and confirmation.
 */
export default function EmailVerificationPanel({ apiBaseUrl }) {
  const pending = useRef(false);
  const [phase, setPhase] = useState(apiBaseUrl ? 'ready' : 'unavailable');
  const [status, setStatus] = useState('Enter the 8-character code from your signup confirmation email.');

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending.current || !apiBaseUrl) return;
    const form = event.currentTarget;
    const code = String(new FormData(form).get('code') ?? '');
    pending.current = true;
    setPhase('pending');
    setStatus('Verifying your email…');
    try {
      await verifyWebsiteEmail({ apiBaseUrl, code });
      form.reset();
      setPhase('complete');
    } catch (error) {
      setPhase('ready');
      setStatus(error instanceof AccountOnboardingError && error.kind === 'validation'
        ? 'Enter the 8-character code exactly as shown in your email.'
        : error instanceof AccountOnboardingError && error.kind === 'rejected'
          ? 'That code could not be verified. Check the email and try again. If you already verified it, return to sign in.'
          : error instanceof AccountOnboardingError && error.kind === 'rate-limited'
            ? 'Too many attempts. Please wait before trying again.'
            : 'Email verification is unavailable right now. Please try again later.');
    } finally { pending.current = false; }
  }

  if (phase === 'complete') return <section><h1>Email verified</h1>
    <p>You can now sign in and create your profile.</p><a href="/account/">Sign in to your account</a></section>;
  if (phase === 'unavailable') return <section><h1>Email verification unavailable</h1>
    <p>Please try again later.</p><a href="/account/">Return to your account</a></section>;

  return <section className="browser-auth-panel">
    <h1>Verify your email address</h1>
    <p aria-live="polite">{status}</p>
    <form onSubmit={handleSubmit}>
      <label htmlFor="verification-code">Verification code</label>
      <input id="verification-code" name="code" autoComplete="one-time-code" autoCapitalize="none" spellCheck={false}
        minLength={8} maxLength={8} pattern="[A-Fa-f0-9]{8}" required disabled={phase === 'pending'} />
      <button type="submit" disabled={phase === 'pending'}>Verify email</button>
    </form>
    <p><a href="/account/">Return to sign in</a></p>
    <p>Check your spam folder if the email has not arrived. <a href="/contact/">Contact support</a> if you still need help.</p>
  </section>;
}

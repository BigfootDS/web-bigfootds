import { useRef, useState } from 'react';
import { AccountOnboardingError, requestWebsiteVerificationEmail, verifyWebsiteEmail } from '../lib/account-onboarding.mjs';
import '../styles/browser-auth-session.css';

/**
 * Manual verification and anonymous recovery. Input remains transient and no
 * capability is read from URLs, persisted or converted into a signed-in session.
 * @param {{ apiBaseUrl?: string }} props Public MS-Auth origin.
 * @returns {import('react').ReactNode} Verification and replacement-code controls.
 */
export default function EmailVerificationPanel({ apiBaseUrl }) {
  const pending = useRef(false);
  const resendPending = useRef(false);
  const [phase, setPhase] = useState(apiBaseUrl ? 'ready' : 'unavailable');
  const [resending, setResending] = useState(false);
  const [status, setStatus] = useState('Paste the 32-character code from your confirmation email. Codes expire after 24 hours.');
  const [resendStatus, setResendStatus] = useState('Request a new code if yours expired or the email did not arrive.');

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
        ? 'Paste the complete 32-character code exactly as shown in your email.'
        : error instanceof AccountOnboardingError && error.kind === 'rejected'
          ? 'That code could not be verified. It may have expired, been replaced or already been used. Request a new code if needed.'
          : error instanceof AccountOnboardingError && error.kind === 'rate-limited'
            ? 'Too many attempts. Please wait before trying again.'
            : 'Email verification is unavailable right now. Please try again later.');
    } finally { pending.current = false; }
  }

  async function handleResend(event) {
    event.preventDefault();
    if (resendPending.current || !apiBaseUrl) return;
    const form = event.currentTarget;
    const email = String(new FormData(form).get('email') ?? '');
    resendPending.current = true;
    setResending(true);
    setResendStatus('Requesting verification instructions…');
    try {
      await requestWebsiteVerificationEmail({ apiBaseUrl, email });
      form.reset();
      setResendStatus('If an eligible account uses that email, check its inbox for verification instructions. Wait at least 60 seconds before requesting again. A new code replaces the previous one and expires after 24 hours.');
    } catch (error) {
      setResendStatus(error instanceof AccountOnboardingError && error.kind === 'validation'
        ? 'Enter the email address used to register your account.'
        : error instanceof AccountOnboardingError && error.kind === 'rate-limited'
          ? 'Too many verification requests. Please wait before trying again.'
          : 'Verification instructions are unavailable right now. Please try again later.');
    } finally { resendPending.current = false; setResending(false); }
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
        minLength={32} maxLength={32} pattern="[A-Fa-f0-9]{32}" required disabled={phase === 'pending'} />
      <button type="submit" disabled={phase === 'pending'}>Verify email</button>
    </form>
    <h2>Request a new code</h2>
    <p aria-live="polite">{resendStatus}</p>
    <form onSubmit={handleResend}>
      <label htmlFor="verification-email">Registered email address</label>
      <input id="verification-email" name="email" type="email" autoComplete="email" maxLength={320} required disabled={resending} />
      <button type="submit" disabled={resending}>Email a new verification code</button>
    </form>
    <p>Existing unverified accounts must verify before signing in.</p>
    <p><a href="/account/">Return to sign in</a></p>
    <p>Check your spam folder if the email has not arrived. <a href="/contact/">Contact support</a> if you still need help.</p>
  </section>;
}

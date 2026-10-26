import { useRef, useState } from 'react';
import { AccountOnboardingError, registerWebsiteAccount } from '../lib/account-onboarding.mjs';
import '../styles/browser-auth-session.css';

/**
 * Collects signup values in a transient form. Returned signup tokens are
 * deliberately discarded; the existing account screen owns later sign-in.
 * @param {{ apiBaseUrl?: string }} props Public MS-Auth origin.
 * @returns {import('react').ReactNode} Signup form and safe next steps.
 */
export default function AccountRegistrationPanel({ apiBaseUrl }) {
  const pending = useRef(false);
  const [phase, setPhase] = useState(apiBaseUrl ? 'ready' : 'unavailable');
  const [status, setStatus] = useState('Use an email address you can access.');

  async function handleSubmit(event) {
    event.preventDefault();
    if (pending.current || !apiBaseUrl) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    pending.current = true;
    setPhase('pending');
    setStatus('Creating your account…');
    try {
      await registerWebsiteAccount({ apiBaseUrl, email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''), confirmation: String(data.get('confirmation') ?? '') });
      form.reset();
      setPhase('complete');
    } catch (error) {
      setPhase('ready');
      setStatus(error instanceof AccountOnboardingError && error.kind === 'validation'
        ? 'Enter a valid email address and a password of at least 8 characters with a matching confirmation.'
        : error instanceof AccountOnboardingError && error.kind === 'rate-limited'
          ? 'Too many attempts. Please wait before trying again.'
          : 'We could not create your account. Check your details or try signing in. Contact support if your confirmation email has not arrived.');
    } finally { pending.current = false; }
  }

  if (phase === 'complete') return <section>
    <h1>Check your email</h1>
    <p>Your account was created. Enter the code from the confirmation email to verify your address.</p>
    <p><a href="/account/verify-email/">Verify your email address</a></p>
    <p><a href="/account/">Return to sign in</a></p>
  </section>;
  if (phase === 'unavailable') return <section><h1>Account creation unavailable</h1>
    <p>Please try again later.</p><a href="/account/">Return to your account</a></section>;

  return <section className="browser-auth-panel">
    <h1>Create your account</h1>
    <p aria-live="polite">{status}</p>
    <form onSubmit={handleSubmit}>
      <fieldset disabled={phase === 'pending'}>
        <legend>Account details</legend>
        <label htmlFor="register-email">Email address</label>
        <input id="register-email" name="email" type="email" autoComplete="email" maxLength={320} required />
        <label htmlFor="register-password">Password</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={1024} required aria-describedby="register-password-help" />
        <p id="register-password-help">Use at least 8 characters, including an uppercase letter, a lowercase letter and a number.</p>
        <label htmlFor="register-confirmation">Confirm password</label>
        <input id="register-confirmation" name="confirmation" type="password" autoComplete="new-password" maxLength={1024} required />
        <button type="submit">Create account</button>
      </fieldset>
    </form>
    <p>Already registered? <a href="/account/">Sign in</a> or <a href="/account/verify-email/">enter your verification code</a>.</p>
    <p><a href="/account/forgot-password/">Forgot your password?</a></p>
    <p><a href="/contact/">Contact support</a></p>
  </section>;
}

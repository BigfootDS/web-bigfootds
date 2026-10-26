import { useCallback, useState } from 'react';
import { BrowserAuthSessionError, verifyStoredBrowserAuthSession } from '../lib/browser-auth-session.mjs';

/**
 * Retains only a safe denial flag for protected panels. The shared session
 * boundary clears the rejected pair; callers still receive the original safe
 * error category, while the panel can hide its controls and offer recovery.
 */
export function useEmailVerificationRecovery() {
  const [requiresVerification, setRequiresVerification] = useState(false);
  const resetVerification = useCallback(() => setRequiresVerification(false), []);
  const verifySession = useCallback(async (input) => {
    try { return await verifyStoredBrowserAuthSession(input); }
    catch (error) {
      if (error instanceof BrowserAuthSessionError && error.kind === 'verification-required') setRequiresVerification(true);
      throw error;
    }
  }, []);
  return { requiresVerification, resetVerification, verifySession };
}

/** Recovery contains no account identity, token, stored code or service detail. */
export function EmailVerificationRequiredNotice() {
  return <section aria-label="Email verification required">
    <p aria-live="polite">Verify your email before continuing.</p>
    <p><a href="/account/verify-email/">Verify email or request a new code</a></p>
    <p><a href="/account/">Return to sign in</a></p>
  </section>;
}

import { readPublicMsAuthBaseUrl } from './browser-auth-session.mjs';

/** A neutral onboarding error that retains no input or service response detail. */
export class AccountOnboardingError extends Error {
  /** @param {'validation' | 'rejected' | 'unavailable' | 'rate-limited'} kind Safe presentation category. */
  constructor(kind) {
    super('Account onboarding could not be completed.');
    this.kind = kind;
  }
}

/**
 * Builds signup against the owning API. Password policy remains in MS-Auth;
 * browser validation only bounds transport and catches a mismatched confirmation.
 * @param {{ apiBaseUrl?: string, email: string, password: string, confirmation: string }} input Form values.
 * @returns {{ init: RequestInit, url: URL }} Cookie-free request with no credentials in its URL.
 */
export function createRegistrationRequest(input) {
  if (typeof input.email !== 'string' || input.email.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)
    || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 1024
    || input.password !== input.confirmation) {
    throw new AccountOnboardingError('validation');
  }
  return createRequest(input.apiBaseUrl, '/v1/users/public/register', {
    email: input.email, password: input.password
  });
}

/**
 * Submits the existing emailed code only in JSON. The website deliberately
 * accepts manual input rather than reading verification capabilities from URLs.
 * @param {{ apiBaseUrl?: string, code: string }} input Public origin and emailed code.
 * @returns {{ init: RequestInit, url: URL }} Fixed verification request.
 */
export function createEmailVerificationRequest(input) {
  const code = typeof input.code === 'string' ? input.code.trim().toLowerCase() : '';
  if (!/^[a-f0-9]{8}$/.test(code)) throw new AccountOnboardingError('validation');
  return createRequest(input.apiBaseUrl, '/v1/users/public/emailVerification', { code });
}

/**
 * Registers without persisting the API's returned token pair. The visitor
 * verifies their email then signs in through the established session boundary.
 * @param {Parameters<typeof createRegistrationRequest>[0] & { fetchImpl?: typeof fetch }} input Form and optional test transport.
 * @returns {Promise<void>} Resolves when MS-Auth accepts signup.
 */
export async function registerWebsiteAccount(input) {
  await sendRequest(createRegistrationRequest(input), input.fetchImpl);
}

/**
 * Verifies a code without persisting it, disclosing server detail or creating a session.
 * @param {Parameters<typeof createEmailVerificationRequest>[0] & { fetchImpl?: typeof fetch }} input Code and optional test transport.
 * @returns {Promise<void>} Resolves when MS-Auth accepts the code.
 */
export async function verifyWebsiteEmail(input) {
  await sendRequest(createEmailVerificationRequest(input), input.fetchImpl);
}

function createRequest(apiBaseUrl, pathname, body) {
  return {
    url: new URL(pathname, readPublicMsAuthBaseUrl(apiBaseUrl)),
    init: {
      body: JSON.stringify(body), cache: 'no-store', credentials: 'omit',
      headers: { accept: 'application/json', 'content-type': 'application/json',
        platformName: 'Website', platformType: 'website', productName: '@bigfootds/web-bigfootds' },
      method: 'POST', redirect: 'error', referrerPolicy: 'no-referrer'
    }
  };
}

async function sendRequest(request, fetchImpl = fetch) {
  let response;
  try { response = await fetchImpl(request.url, request.init); }
  catch { throw new AccountOnboardingError('unavailable'); }
  if (!response.ok) {
    throw new AccountOnboardingError(response.status === 429 ? 'rate-limited'
      : response.status >= 500 ? 'unavailable' : 'rejected');
  }
}

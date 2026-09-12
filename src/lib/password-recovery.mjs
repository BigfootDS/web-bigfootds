import { readPublicMsAuthBaseUrl } from './browser-auth-session.mjs';

export const PASSWORD_RESET_REQUEST_PATH = '/v1/users/public/password-reset-requests';
export const PASSWORD_RESET_COMPLETION_PATH = '/v1/users/public/password-resets';

const maximumEmailLength = 320;
const maximumPasswordLength = 1_024;
const resetTokenPattern = /^[A-Za-z0-9_-]{43}$/;

/**
 * Represents a safe, presentation-ready failure from the anonymous recovery
 * flow. It deliberately contains no server response, email address, password
 * or reset token, so callers can render it without exposing sensitive data.
 */
export class PasswordRecoveryError extends Error {
  /**
   * @param {'invalid-response' | 'rejected' | 'unavailable' | 'validation'} kind Safe category for browser presentation.
   */
  constructor(kind) {
    super('Password recovery could not be completed.');
    this.kind = kind;
  }
}

/**
 * Captures the reset token from a one-time URL fragment and immediately removes
 * every fragment value from the current history entry.
 *
 * Fragments are not sent in an HTTP request, but clearing one before the form
 * is usable prevents it from being copied, revisited, or exposed to a later
 * same-page navigation. The returned token belongs only in component memory.
 *
 * @param {{ history: Pick<History, 'replaceState' | 'state'>, location: Pick<Location, 'hash' | 'pathname' | 'search'> }} browser Current browser location and history.
 * @returns {string | undefined} A valid opaque reset token, if the fragment held one.
 */
export function consumePasswordResetTokenFromFragment({ history, location }) {
  const token = readPasswordResetTokenFromFragment(location.hash);

  if (location.hash) {
    history.replaceState(history.state, '', `${location.pathname}${location.search}`);
  }

  return token;
}

/**
 * Builds the anonymous, account-enumeration-safe password-reset request.
 *
 * This sends no browser session, cookie, referrer, or response data. MS-Auth
 * intentionally returns an accepted response for every valid-shaped email.
 *
 * @param {{ apiBaseUrl: string | undefined, email: string }} input Visitor-supplied recovery email and public MS-Auth origin.
 * @returns {{ init: RequestInit, url: URL }} Fixed request for MS-Auth.
 * @throws {import('./browser-auth-session.mjs').BrowserAuthSessionError | PasswordRecoveryError} When configuration or input is unsafe.
 */
export function createMsAuthPasswordResetRequest(input) {
  return createPublicPasswordRecoveryRequest({
    apiBaseUrl: input.apiBaseUrl,
    body: { email: readEmail(input.email) },
    pathname: PASSWORD_RESET_REQUEST_PATH
  });
}

/**
 * Builds a one-time reset completion request without persisting the token or
 * new password. MS-Auth remains authoritative for password policy and token
 * redemption, so this only validates safe transport bounds.
 *
 * @param {{ apiBaseUrl: string | undefined, password: string, token: string }} input Fragment token, chosen password, and public MS-Auth origin.
 * @returns {{ init: RequestInit, url: URL }} Fixed request for MS-Auth.
 * @throws {import('./browser-auth-session.mjs').BrowserAuthSessionError | PasswordRecoveryError} When configuration or input is unsafe.
 */
export function createMsAuthPasswordResetCompletionRequest(input) {
  return createPublicPasswordRecoveryRequest({
    apiBaseUrl: input.apiBaseUrl,
    body: {
      password: readPassword(input.password),
      token: readResetToken(input.token)
    },
    pathname: PASSWORD_RESET_COMPLETION_PATH
  });
}

/**
 * Requests reset instructions from MS-Auth without interpreting its response
 * body. The generic response keeps account existence private to the service.
 *
 * @param {{ apiBaseUrl: string | undefined, email: string, fetchImpl?: typeof fetch }} input Browser request dependencies.
 * @returns {Promise<void>} Resolves only for an accepted HTTP response.
 */
export async function requestPasswordReset(input) {
  const request = createMsAuthPasswordResetRequest(input);
  await sendPasswordRecoveryRequest(input.fetchImpl, request);
}

/**
 * Submits a new password to MS-Auth using the token that stayed in browser
 * memory after fragment capture. It never creates a browser auth session.
 *
 * @param {{ apiBaseUrl: string | undefined, fetchImpl?: typeof fetch, password: string, token: string }} input Browser request dependencies.
 * @returns {Promise<void>} Resolves only when MS-Auth accepts the reset.
 */
export async function completePasswordReset(input) {
  const request = createMsAuthPasswordResetCompletionRequest(input);
  await sendPasswordRecoveryRequest(input.fetchImpl, request);
}

function createPublicPasswordRecoveryRequest({ apiBaseUrl, body, pathname }) {
  return {
    init: {
      body: JSON.stringify(body),
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        platformName: 'Website',
        platformType: 'website',
        productName: '@bigfootds/web-bigfootds'
      },
      method: 'POST',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    },
    url: new URL(pathname, readPublicMsAuthBaseUrl(apiBaseUrl))
  };
}

async function sendPasswordRecoveryRequest(fetchImpl = fetch, request) {
  let response;
  try {
    response = await fetchImpl(request.url, request.init);
  } catch {
    throw new PasswordRecoveryError('unavailable');
  }

  if (!response.ok) {
    throw new PasswordRecoveryError(response.status >= 500 ? 'unavailable' : 'rejected');
  }
}

function readPasswordResetTokenFromFragment(fragment) {
  if (typeof fragment !== 'string' || fragment === '') return undefined;

  const tokens = new URLSearchParams(fragment.slice(1)).getAll('token');
  if (tokens.length !== 1 || !resetTokenPattern.test(tokens[0])) return undefined;
  return tokens[0];
}

function readEmail(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximumEmailLength
    || value !== value.trim()
    || /[\r\n]/.test(value)
  ) {
    throw new PasswordRecoveryError('validation');
  }
  return value;
}

function readPassword(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumPasswordLength) {
    throw new PasswordRecoveryError('validation');
  }
  return value;
}

function readResetToken(value) {
  if (typeof value !== 'string' || !resetTokenPattern.test(value)) {
    throw new PasswordRecoveryError('validation');
  }
  return value;
}

export const BROWSER_AUTH_SESSION_STORAGE_KEY = 'bigfootds.web.auth-session.v1';

const maximumEmailLength = 320;
const maximumPasswordLength = 1_024;
const maximumTokenLength = 8_192;
const tokenPattern = /^[A-Za-z0-9._~-]+$/;

/**
 * Represents a browser authentication failure without retaining sensitive
 * server, token, password, email, or request details.
 *
 * UI code may inspect kind for safe presentation copy, but must never display
 * a raw error returned by an authentication endpoint.
 */
export class BrowserAuthSessionError extends Error {
  /**
   * @param {'configuration' | 'invalid-response' | 'rejected' | 'verification-required' | 'storage' | 'unavailable' | 'validation'} kind Safe category for browser presentation.
   */
  constructor(kind) {
    super('Browser authentication could not be completed.');
    this.kind = kind;
  }
}

/**
 * Reads the public MS-Auth origin used by browser requests.
 *
 * The value is non-secret build configuration, but it is still limited to a
 * bare HTTPS origin, or loopback HTTP in development, so it cannot smuggle a
 * credential, path, or redirect target into a signed-in browser request.
 *
 * @param {string | undefined} value Public browser build value.
 * @returns {string} Canonical API origin without a trailing slash.
 * @throws {BrowserAuthSessionError} When the origin is absent or unsafe.
 */
export function readPublicMsAuthBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BrowserAuthSessionError('configuration');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new BrowserAuthSessionError('configuration');
  }

  const localHttp = url.protocol === 'http:' && isLoopbackHost(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp)
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new BrowserAuthSessionError('configuration');
  }

  return url.origin;
}

/**
 * Reads a token pair from browser storage and discards malformed values.
 *
 * Browser storage is untrusted input, even after this module wrote it. A same
 * origin script or a locally modified browser profile can change stored data,
 * so it is checked before either value reaches a request header.
 *
 * @param {Storage} storage Browser local storage.
 * @returns {{ accessToken: string, refreshToken: string } | undefined} Valid current pair, if present.
 * @throws {BrowserAuthSessionError} When the browser disallows storage access.
 */
export function readStoredBrowserAuthSession(storage) {
  let serialised;
  try {
    serialised = storage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY);
  } catch {
    throw new BrowserAuthSessionError('storage');
  }

  if (serialised === null) return undefined;

  try {
    return readTokenPair(JSON.parse(serialised));
  } catch {
    try {
      storage.removeItem(BROWSER_AUTH_SESSION_STORAGE_KEY);
    } catch {
      throw new BrowserAuthSessionError('storage');
    }
    return undefined;
  }
}

/**
 * Replaces the one persisted browser session record.
 *
 * Passwords, email addresses, server error details, and user profiles never
 * belong in this record. Callers may only persist a pair returned by MS-Auth
 * or a pair already validated by this module.
 *
 * @param {Storage} storage Browser local storage.
 * @param {{ accessToken: string, refreshToken: string }} session Valid token pair.
 * @returns {void}
 * @throws {BrowserAuthSessionError} When storage cannot be written.
 */
export function writeStoredBrowserAuthSession(storage, session) {
  const safeSession = readTokenPair(session);
  try {
    storage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify(safeSession));
  } catch {
    throw new BrowserAuthSessionError('storage');
  }
}

/**
 * Removes the local browser copy of the token pair.
 *
 * MS-Auth retains refresh-token state. This is intentionally local sign-out,
 * not a claim that a browser without the token can revoke a server record.
 *
 * @param {Storage} storage Browser local storage.
 * @returns {void}
 * @throws {BrowserAuthSessionError} When storage cannot be written.
 */
export function clearStoredBrowserAuthSession(storage) {
  try {
    storage.removeItem(BROWSER_AUTH_SESSION_STORAGE_KEY);
  } catch {
    throw new BrowserAuthSessionError('storage');
  }
}

/**
 * Creates the fixed public login request.
 *
 * Password input travels only in this request body. It is never persisted,
 * logged, or included in a browser error.
 *
 * @param {{ apiBaseUrl: string | undefined, email: string, password: string }} input Browser sign-in data.
 * @returns {{ init: RequestInit, url: URL }} Request ready for fetch.
 * @throws {BrowserAuthSessionError} When configuration or form data is invalid.
 */
export function createMsAuthLoginRequest(input) {
  const email = readEmail(input.email);
  const password = readPassword(input.password);
  const url = createMsAuthUrl(input.apiBaseUrl, '/v1/users/public/login');

  return {
    init: {
      body: JSON.stringify({ email, password }),
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
      referrerPolicy: 'no-referrer'
    },
    url
  };
}

/**
 * Adds MS-Auth's token-pair headers to a browser request.
 *
 * This is deliberately specific to MS-Auth. Other microservices have their
 * own existing access-token transports, so later consumer tasks must document
 * their exact headers rather than assume every service accepts these names.
 *
 * @param {RequestInit} requestInit Request options without user-token headers.
 * @param {{ accessToken: string, refreshToken: string }} session Valid token pair.
 * @returns {RequestInit} No-store, cookie-free options with both tokens.
 * @throws {BrowserAuthSessionError} When callers try to override token headers.
 */
export function createMsAuthTokenPairRequestInit(requestInit, session) {
  const safeSession = readTokenPair(session);
  const headers = new Headers(requestInit.headers);

  if (headers.has('accessToken') || headers.has('refreshToken')) {
    throw new BrowserAuthSessionError('validation');
  }

  headers.set('accessToken', safeSession.accessToken);
  headers.set('refreshToken', safeSession.refreshToken);

  return {
    ...requestInit,
    cache: 'no-store',
    credentials: 'omit',
    headers,
    referrerPolicy: 'no-referrer'
  };
}

/**
 * Requests a fresh MS-Auth access token with the current pair.
 *
 * MS-Auth uses its persisted refresh-token state only when the access token
 * has expired. When the response omits refreshToken, this keeps the valid
 * refresh token already held by the browser.
 *
 * @param {{ apiBaseUrl: string | undefined, session: { accessToken: string, refreshToken: string } }} input Current session and API origin.
 * @returns {{ init: RequestInit, url: URL }} Verification request ready for fetch.
 */
export function createMsAuthVerificationRequest(input) {
  return {
    init: createMsAuthTokenPairRequestInit({ headers: { accept: 'application/json' } }, input.session),
    url: createMsAuthUrl(input.apiBaseUrl, '/v1/users/protected/verify')
  };
}

/**
 * Signs in against MS-Auth and persists only the returned token pair.
 *
 * @param {{ apiBaseUrl: string | undefined, email: string, fetchImpl?: typeof fetch, password: string, storage: Storage }} input Browser sign-in dependencies.
 * @returns {Promise<{ accessToken: string, refreshToken: string }>} Stored token pair.
 * @throws {BrowserAuthSessionError} For safe presentation failures.
 */
export async function signInBrowserAuthSession(input) {
  const request = createMsAuthLoginRequest(input);
  const response = await sendRequest(input.fetchImpl, request);

  if (!response.ok) {
    const error = await readResponseError(response);
    if (error.kind === 'verification-required') clearStoredBrowserAuthSession(input.storage);
    throw error;
  }

  const session = await readTokenPairResponse(response);
  writeStoredBrowserAuthSession(input.storage, session);
  return session;
}

/**
 * Verifies a stored session and replaces its access token when MS-Auth renews
 * it. Rejected sessions are removed locally; unavailable MS-Auth and storage
 * errors retain the existing record so a visitor can try again later.
 *
 * @param {{ apiBaseUrl: string | undefined, fetchImpl?: typeof fetch, storage: Storage }} input Browser session dependencies.
 * @returns {Promise<{ accessToken: string, refreshToken: string } | undefined>} Current verified pair, if stored.
 * @throws {BrowserAuthSessionError} For safe presentation failures.
 */
export async function verifyStoredBrowserAuthSession(input) {
  const current = readStoredBrowserAuthSession(input.storage);
  if (current === undefined) return undefined;

  const request = createMsAuthVerificationRequest({ apiBaseUrl: input.apiBaseUrl, session: current });
  const response = await sendRequest(input.fetchImpl, request);

  if (!response.ok) {
    const error = await readResponseError(response);
    if (error.kind === 'rejected' || error.kind === 'verification-required') clearStoredBrowserAuthSession(input.storage);
    throw error;
  }

  const renewedSession = await readTokenPairResponse(response, current.refreshToken);
  writeStoredBrowserAuthSession(input.storage, renewedSession);
  return renewedSession;
}

async function sendRequest(fetchImpl = fetch, request) {
  try {
    return await fetchImpl(request.url, request.init);
  } catch {
    throw new BrowserAuthSessionError('unavailable');
  }
}

async function readTokenPairResponse(response, retainedRefreshToken = undefined) {
  let body;
  try {
    body = await response.json();
  } catch {
    throw new BrowserAuthSessionError('invalid-response');
  }

  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'accessToken' && key !== 'refreshToken')) {
    throw new BrowserAuthSessionError('invalid-response');
  }

  try {
    return readTokenPair({
      accessToken: body.accessToken,
      refreshToken: body.refreshToken === undefined ? retainedRefreshToken : body.refreshToken
    });
  } catch {
    throw new BrowserAuthSessionError('invalid-response');
  }
}

function createMsAuthUrl(apiBaseUrl, pathname) {
  return new URL(pathname, readPublicMsAuthBaseUrl(apiBaseUrl));
}

function readTokenPair(value) {
  if (!isRecord(value)) throw new BrowserAuthSessionError('validation');

  return {
    accessToken: readToken(value.accessToken),
    refreshToken: readToken(value.refreshToken)
  };
}

function readToken(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximumTokenLength
    || !tokenPattern.test(value)
  ) {
    throw new BrowserAuthSessionError('validation');
  }
  return value;
}

function readEmail(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximumEmailLength
    || value !== value.trim()
    || /[\r\n]/.test(value)
  ) {
    throw new BrowserAuthSessionError('validation');
  }
  return value;
}

function readPassword(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > maximumPasswordLength
  ) {
    throw new BrowserAuthSessionError('validation');
  }
  return value;
}

function responseError(status) {
  return new BrowserAuthSessionError(status >= 500 ? 'unavailable' : 'rejected');
}

/** Reads only an allow-listed machine code, never retaining raw server detail. */
async function readResponseError(response) {
  if (response.status === 403) {
    try {
      const body = await response.json();
      if (body?.code === 'email_verification_required') return new BrowserAuthSessionError('verification-required');
    } catch { /* A malformed error remains an ordinary rejected session. */ }
  }
  return responseError(response.status);
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

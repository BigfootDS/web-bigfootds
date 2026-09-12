import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BROWSER_AUTH_SESSION_STORAGE_KEY,
  BrowserAuthSessionError,
  clearStoredBrowserAuthSession,
  createMsAuthLoginRequest,
  createMsAuthTokenPairRequestInit,
  createMsAuthVerificationRequest,
  readPublicMsAuthBaseUrl,
  readStoredBrowserAuthSession,
  signInBrowserAuthSession,
  verifyStoredBrowserAuthSession,
  writeStoredBrowserAuthSession
} from '../src/lib/browser-auth-session.mjs';

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  removeItem(key) {
    this.#values.delete(key);
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

const apiBaseUrl = 'https://auth.bigfootds.dev/';
const session = {
  accessToken: 'access.token-1',
  refreshToken: 'refresh.token-1'
};

test('accepts only a bare HTTPS or loopback development MS-Auth origin', () => {
  assert.equal(readPublicMsAuthBaseUrl(apiBaseUrl), 'https://auth.bigfootds.dev');
  assert.equal(readPublicMsAuthBaseUrl('http://localhost:3000'), 'http://localhost:3000');

  for (const value of [
    'https://auth.bigfootds.dev/v1',
    'https://user:password@auth.bigfootds.dev/',
    'https://auth.bigfootds.dev/?next=/admin',
    'http://auth.bigfootds.dev/'
  ]) {
    assert.throws(() => readPublicMsAuthBaseUrl(value), isConfigurationError);
  }
});

test('discards malformed locally stored data before it can enter request headers', () => {
  const storage = new MemoryStorage();
  storage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify({ accessToken: 'valid', refreshToken: '' }));

  assert.equal(readStoredBrowserAuthSession(storage), undefined);
  assert.equal(storage.getItem(BROWSER_AUTH_SESSION_STORAGE_KEY), null);

  writeStoredBrowserAuthSession(storage, session);
  assert.deepEqual(readStoredBrowserAuthSession(storage), session);
  clearStoredBrowserAuthSession(storage);
  assert.equal(readStoredBrowserAuthSession(storage), undefined);
});

test('creates a no-cookie, no-referrer login request without token headers', () => {
  const request = createMsAuthLoginRequest({
    apiBaseUrl,
    email: 'player@example.com',
    password: 'not-a-real-password'
  });

  assert.equal(request.url.href, 'https://auth.bigfootds.dev/v1/users/public/login');
  assert.equal(request.init.method, 'POST');
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.referrerPolicy, 'no-referrer');
  assert.equal(request.init.cache, 'no-store');
  assert.deepEqual(JSON.parse(request.init.body), { email: 'player@example.com', password: 'not-a-real-password' });
  assert.equal('accessToken' in request.init.headers, false);
  assert.equal('refreshToken' in request.init.headers, false);
});

test('creates MS-Auth verification requests with the exact token pair', () => {
  const request = createMsAuthVerificationRequest({ apiBaseUrl, session });

  assert.equal(request.url.href, 'https://auth.bigfootds.dev/v1/users/protected/verify');
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.referrerPolicy, 'no-referrer');
  assert.equal(request.init.headers.get('accessToken'), session.accessToken);
  assert.equal(request.init.headers.get('refreshToken'), session.refreshToken);

  assert.throws(
    () => createMsAuthTokenPairRequestInit({ headers: { accessToken: 'untrusted' } }, session),
    (error) => error instanceof BrowserAuthSessionError && error.kind === 'validation'
  );
});

test('stores a login result and retains the refresh token when MS-Auth only renews access', async () => {
  const storage = new MemoryStorage();
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ init, url: url.href });
    if (url.pathname.endsWith('/login')) {
      return Response.json(session);
    }
    return Response.json({ accessToken: 'access.token-2' });
  };

  await signInBrowserAuthSession({
    apiBaseUrl,
    email: 'player@example.com',
    fetchImpl,
    password: 'not-a-real-password',
    storage
  });
  const renewed = await verifyStoredBrowserAuthSession({ apiBaseUrl, fetchImpl, storage });

  assert.deepEqual(renewed, { accessToken: 'access.token-2', refreshToken: session.refreshToken });
  assert.deepEqual(readStoredBrowserAuthSession(storage), renewed);
  assert.equal(calls.length, 2);
});

test('removes a rejected session without exposing an MS-Auth response body', async () => {
  const storage = new MemoryStorage();
  writeStoredBrowserAuthSession(storage, session);

  await assert.rejects(
    verifyStoredBrowserAuthSession({
      apiBaseUrl,
      fetchImpl: async () => new Response('private server detail', { status: 403 }),
      storage
    }),
    (error) => error instanceof BrowserAuthSessionError
      && error.kind === 'rejected'
      && !error.message.includes('private server detail')
  );
  assert.equal(readStoredBrowserAuthSession(storage), undefined);
});

test('keeps a stored session when MS-Auth is temporarily unavailable', async () => {
  const storage = new MemoryStorage();
  writeStoredBrowserAuthSession(storage, session);

  await assert.rejects(
    verifyStoredBrowserAuthSession({
      apiBaseUrl,
      fetchImpl: async () => new Response(null, { status: 503 }),
      storage
    }),
    (error) => error instanceof BrowserAuthSessionError && error.kind === 'unavailable'
  );
  assert.deepEqual(readStoredBrowserAuthSession(storage), session);
});

function isConfigurationError(error) {
  return error instanceof BrowserAuthSessionError && error.kind === 'configuration';
}

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PASSWORD_RESET_COMPLETION_PATH,
  PASSWORD_RESET_REQUEST_PATH,
  PasswordRecoveryError,
  completePasswordReset,
  consumePasswordResetTokenFromFragment,
  createMsAuthPasswordResetCompletionRequest,
  createMsAuthPasswordResetRequest,
  requestPasswordReset
} from '../src/lib/password-recovery.mjs';

const apiBaseUrl = 'https://auth.bigfootds.dev/';
const resetToken = 'Z5DRSZ6F_6L_6QHvKK90IxLYyMQp0p6pK8pocnSoD2A';

test('captures a valid fragment token then removes every fragment value from browser history', () => {
  const calls = [];
  const history = {
    replaceState: (...args) => calls.push(args),
    state: { navigation: 'safe' }
  };
  const location = {
    hash: `#token=${resetToken}&unrelated=discarded`,
    pathname: '/account/reset-password/',
    search: '?campaign=account-recovery'
  };

  assert.equal(consumePasswordResetTokenFromFragment({ history, location }), resetToken);
  assert.deepEqual(calls, [[history.state, '', '/account/reset-password/?campaign=account-recovery']]);
});

test('clears malformed, duplicate, and missing reset fragments without returning a token', () => {
  for (const hash of ['', '#token=too-short', `#token=${resetToken}&token=${resetToken}`, '#other=value']) {
    const calls = [];
    const history = { replaceState: (...args) => calls.push(args), state: null };
    const location = { hash, pathname: '/account/reset-password/', search: '' };

    assert.equal(consumePasswordResetTokenFromFragment({ history, location }), undefined);
    assert.equal(calls.length, hash ? 1 : 0);
  }
});

test('creates fixed, anonymous password recovery requests with safe fetch settings', () => {
  const requested = createMsAuthPasswordResetRequest({ apiBaseUrl, email: 'player@example.com' });
  const completed = createMsAuthPasswordResetCompletionRequest({
    apiBaseUrl,
    password: 'new-not-a-real-password',
    token: resetToken
  });

  assert.equal(PASSWORD_RESET_REQUEST_PATH, '/v1/users/public/password-reset-requests');
  assert.equal(requested.url.href, `https://auth.bigfootds.dev${PASSWORD_RESET_REQUEST_PATH}`);
  assert.deepEqual(JSON.parse(requested.init.body), { email: 'player@example.com' });
  assert.equal(PASSWORD_RESET_COMPLETION_PATH, '/v1/users/public/password-resets');
  assert.equal(completed.url.href, `https://auth.bigfootds.dev${PASSWORD_RESET_COMPLETION_PATH}`);
  assert.deepEqual(JSON.parse(completed.init.body), { password: 'new-not-a-real-password', token: resetToken });

  for (const request of [requested, completed]) {
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.cache, 'no-store');
    assert.equal(request.init.credentials, 'omit');
    assert.equal(request.init.referrerPolicy, 'no-referrer');
    assert.equal(request.init.redirect, 'error');
    assert.equal('accessToken' in request.init.headers, false);
    assert.equal('refreshToken' in request.init.headers, false);
    assert.equal('Authorization' in request.init.headers, false);
  }
});

test('rejects malformed input before a reset token or password enters a request', () => {
  assert.throws(
    () => createMsAuthPasswordResetRequest({ apiBaseUrl, email: ' player@example.com' }),
    isValidationError
  );
  assert.throws(
    () => createMsAuthPasswordResetCompletionRequest({ apiBaseUrl, password: '', token: resetToken }),
    isValidationError
  );
  assert.throws(
    () => createMsAuthPasswordResetCompletionRequest({ apiBaseUrl, password: 'new-password', token: 'invalid' }),
    isValidationError
  );
});

test('keeps server details out of rejected and unavailable recovery failures', async () => {
  await assert.rejects(
    requestPasswordReset({
      apiBaseUrl,
      email: 'player@example.com',
      fetchImpl: async () => new Response('private recipient detail', { status: 400 })
    }),
    (error) => error instanceof PasswordRecoveryError
      && error.kind === 'rejected'
      && !error.message.includes('private recipient detail')
  );
  await assert.rejects(
    completePasswordReset({
      apiBaseUrl,
      password: 'new-not-a-real-password',
      token: resetToken,
      fetchImpl: async () => { throw new Error('private network detail'); }
    }),
    (error) => error instanceof PasswordRecoveryError
      && error.kind === 'unavailable'
      && !error.message.includes('private network detail')
  );
});

function isValidationError(error) {
  return error instanceof PasswordRecoveryError && error.kind === 'validation';
}

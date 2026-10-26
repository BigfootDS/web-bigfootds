import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountOnboardingError, createRegistrationRequest, createEmailVerificationRequest,
  registerWebsiteAccount, verifyWebsiteEmail } from '../src/lib/account-onboarding.mjs';

const registration = { apiBaseUrl: 'https://auth.example.test', email: 'player@example.test',
  password: 'ExamplePassword1', confirmation: 'ExamplePassword1' };

test('sends signup and verification values only in fixed, cookie-free request bodies', () => {
  for (const [request, pathname, body] of [
    [createRegistrationRequest(registration), '/v1/users/public/register', { email: registration.email, password: registration.password }],
    [createEmailVerificationRequest({ apiBaseUrl: registration.apiBaseUrl, code: ' A012BCDEA012BCDEA012BCDEA012BCDE ' }), '/v1/users/public/emailVerification', { code: 'a012bcdea012bcdea012bcdea012bcde' }]
  ]) {
    assert.equal(request.url.href, registration.apiBaseUrl + pathname);
    assert.deepEqual(JSON.parse(request.init.body), body);
    assert.equal(request.init.method, 'POST');
    assert.equal(request.init.credentials, 'omit');
    assert.equal(request.init.cache, 'no-store');
    assert.equal(request.init.redirect, 'error');
    assert.equal(request.init.referrerPolicy, 'no-referrer');
    const headers = new Headers(request.init.headers);
    for (const name of ['Authorization', 'accessToken', 'refreshToken']) assert.equal(headers.has(name), false);
  }
});

test('rejects invalid signup, unsafe origins and malformed verification before transport', async () => {
  for (const changed of [{ email: 'bad' }, { email: ' user@example.test' }, { password: 'short', confirmation: 'short' },
    { confirmation: 'different' }, { password: 'A'.repeat(1025) }]) {
    assert.throws(() => createRegistrationRequest({ ...registration, ...changed }), AccountOnboardingError);
  }
  for (const apiBaseUrl of ['https://user:secret@auth.example.test', 'https://auth.example.test/path', 'https://auth.example.test?code=secret', undefined]) {
    assert.throws(() => createRegistrationRequest({ ...registration, apiBaseUrl }));
  }
  for (const code of [undefined, '', '0123abcd', 'a'.repeat(31), 'a'.repeat(33), 'notacode', ['a012bcdea012bcdea012bcdea012bcde']]) {
    assert.throws(() => createEmailVerificationRequest({ apiBaseUrl: registration.apiBaseUrl, code }), AccountOnboardingError);
  }
  let calls = 0;
  await assert.rejects(registerWebsiteAccount({ ...registration, confirmation: '', fetchImpl: async () => { calls += 1; } }));
  assert.equal(calls, 0);
});

test('discards signup response credentials and never reads rejected server detail', async () => {
  await registerWebsiteAccount({ ...registration, fetchImpl: async () => ({ ok: true,
    json() { throw new Error('Signup tokens must not be read or stored'); } }) });
  for (const [status, kind] of [[400, 'rejected'], [401, 'rejected'], [429, 'rate-limited'], [503, 'unavailable']]) {
    await assert.rejects(verifyWebsiteEmail({ apiBaseUrl: registration.apiBaseUrl, code: 'a012bcdea012bcdea012bcdea012bcde',
      fetchImpl: async () => new Response('private-provider-detail', { status }) }), (error) => {
      assert.equal(error.kind, kind);
      assert.doesNotMatch(JSON.stringify(error), /private-provider/);
      return true;
    });
  }
  await assert.rejects(registerWebsiteAccount({ ...registration, fetchImpl: async () => { throw new Error('private-network-detail'); } }),
    (error) => error.kind === 'unavailable' && !error.message.includes('private-network'));
});

test('requests verification replacement with a private fixed-body transport and generic acceptance', async () => {
  const { requestWebsiteVerificationEmail } = await import('../src/lib/account-onboarding.mjs');
  let calls = 0;
  await requestWebsiteVerificationEmail({ apiBaseUrl: registration.apiBaseUrl, email: registration.email,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.equal(url.href, registration.apiBaseUrl + '/v1/users/public/email-verification-requests');
      assert.deepEqual(JSON.parse(init.body), { email: registration.email });
      assert.equal(init.credentials, 'omit'); assert.equal(init.cache, 'no-store');
      assert.equal(init.redirect, 'error'); assert.equal(init.referrerPolicy, 'no-referrer');
      assert.equal(init.method, 'POST'); assert.equal(new Headers(init.headers).has('Authorization'), false);
      return new Response(null, { status: 202 });
    } });
  assert.equal(calls, 1);
  await assert.rejects(requestWebsiteVerificationEmail({ email: 'invalid', apiBaseUrl: registration.apiBaseUrl,
    fetchImpl: async () => { calls += 1; } }), (error) => error.kind === 'validation');
  assert.equal(calls, 1);
  for (const [status, kind] of [[429, 'rate-limited'], [503, 'unavailable']]) {
    await assert.rejects(requestWebsiteVerificationEmail({ email: registration.email, apiBaseUrl: registration.apiBaseUrl,
      fetchImpl: async () => new Response('private provider response', { status }) }),
    (error) => error.kind === kind && !JSON.stringify(error).includes('private provider'));
  }
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import AccountHub from '../src/components/AccountHub.jsx';
import AccountProfilePanel from '../src/components/AccountProfilePanel.jsx';
import RelationshipPanel from '../src/components/RelationshipPanel.jsx';
import { BROWSER_AUTH_SESSION_STORAGE_KEY } from '../src/lib/browser-auth-session.mjs';

const authBaseUrl = 'https://auth.bigfootds.dev';
const accountsBaseUrl = 'https://accounts.bigfootds.dev';
const userRelationsBaseUrl = 'https://userrelations.bigfootds.dev';

test('retries a rejected profile save once after renewal and keeps the editable conflict state', async () => {
  writeSession({ accessToken: 'access.initial', refreshToken: 'refresh.current' });
  const calls = [];
  let verificationCount = 0;
  let patchCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    calls.push({ init, url });
    if (url.origin === authBaseUrl) {
      verificationCount += 1;
      return json({ accessToken: `access.renewed-${verificationCount}` });
    }
    if (init.method === 'GET') return json(editableProfile);
    patchCount += 1;
    return new Response(null, { status: patchCount === 1 ? 401 : 409 });
  }));

  render(<AccountProfilePanel apiBaseUrl={accountsBaseUrl} authBaseUrl={authBaseUrl} />);
  await screen.findByRole('heading', { name: 'Your profile' });

  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

  await screen.findByText('That display name or profile data is already in use. Change it and try again.');
  expect(patchCount).toBe(2);
  expect(verificationCount).toBe(3);
  expect(screen.getByRole('heading', { name: 'Your profile' })).toBeTruthy();
  expect(screen.getByDisplayValue('Alex')).toBeTruthy();

  const patchCalls = calls.filter(({ init, url }) => url.origin === accountsBaseUrl && init.method === 'PATCH');
  expect(patchCalls).toHaveLength(2);
  expect(patchCalls[0].init.headers.get('accessToken')).toBe('access.renewed-2');
  expect(patchCalls[1].init.headers.get('accessToken')).toBe('access.renewed-3');
});

test('renews and retries one rejected relationship read without forwarding a bearer credential', async () => {
  writeSession({ accessToken: 'access.initial', refreshToken: 'refresh.current' });
  const calls = [];
  let verificationCount = 0;
  let summaryCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    calls.push({ init, url });
    if (url.origin === authBaseUrl) {
      verificationCount += 1;
      return json({ accessToken: `access.renewed-${verificationCount}` });
    }
    if (url.pathname.endsWith('/summary')) {
      summaryCount += 1;
      return summaryCount === 1 ? new Response(null, { status: 401 }) : json(relationshipSummary);
    }
    return json({ hasMore: false, items: [], nextCursor: null });
  }));

  render(<RelationshipPanel apiBaseUrl={userRelationsBaseUrl} authBaseUrl={authBaseUrl} />);
  await screen.findByText('Your connection lists are up to date.');

  await waitFor(() => expect(summaryCount).toBe(2));
  expect(verificationCount).toBe(2);
  const relationshipCalls = calls.filter(({ url }) => url.origin === userRelationsBaseUrl);
  expect(relationshipCalls).toHaveLength(6);
  for (const { init } of relationshipCalls) {
    expect(init.headers.get('Authorization')).toBeNull();
    expect(init.headers.get('refreshToken')).toBe('refresh.current');
  }
});

test('refreshes profile controls after sign-in on the combined account screen', async () => {
  window.localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    if (url.origin === authBaseUrl && url.pathname.endsWith('/login')) {
      return json({ accessToken: 'access.fresh', refreshToken: 'refresh.fresh' });
    }
    if (url.origin === authBaseUrl) return json({ accessToken: 'access.renewed' });
    if (url.origin === accountsBaseUrl && init.method === 'GET') return json(editableProfile);
    throw new Error(`Unexpected request ${init.method} ${url}`);
  }));

  render(<AccountHub accountsBaseUrl={accountsBaseUrl} authBaseUrl={authBaseUrl} />);
  expect(await screen.findByRole('heading', { name: 'Your account' })).toBeTruthy();
  expect(await screen.findByText('Sign in to create or edit your profile.')).toBeTruthy();

  fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'player@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'not-a-real-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

  expect(await screen.findByRole('heading', { name: 'Your profile', level: 2 })).toBeTruthy();
  expect(screen.getByDisplayValue('Alex')).toBeTruthy();
});

test('does not restore a deferred profile response after local sign-out', async () => {
  writeSession({ accessToken: 'access.current', refreshToken: 'refresh.current' });
  let resolveProfileResponse;
  const profileResponse = new Promise((resolve) => {
    resolveProfileResponse = resolve;
  });
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    if (url.origin === authBaseUrl) return json({ accessToken: 'access.renewed' });
    if (url.origin === accountsBaseUrl && init.method === 'GET') return profileResponse;
    throw new Error(`Unexpected request ${init.method} ${url}`);
  }));

  render(<AccountHub accountsBaseUrl={accountsBaseUrl} authBaseUrl={authBaseUrl} />);
  expect(await screen.findByRole('heading', { name: 'Account session' })).toBeTruthy();
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ method: 'GET' })));

  fireEvent.click(screen.getByRole('button', { name: 'Sign out on this browser' }));
  resolveProfileResponse(json(editableProfile));

  expect(await screen.findByText('Sign in to create or edit your profile.')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Your profile' })).toBeNull();
  expect(screen.queryByDisplayValue('Alex')).toBeNull();
});

const editableProfile = {
  biography: '',
  displayName: 'Alex',
  nameplate: '',
  socialLinks: [],
  tag: ''
};

const relationshipSummary = {
  activeBlockCount: 0,
  incomingPendingCount: 0,
  outgoingPendingCount: 0,
  visibleFriendCount: 0
};

function json(value) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}

function writeSession(session) {
  window.localStorage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
}

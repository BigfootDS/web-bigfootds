import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import StaffNewsComposer, { StaffNewsRichEditor } from '../src/components/StaffNewsComposer.jsx';
import StaffNewsDashboard from '../src/components/StaffNewsDashboard.jsx';
import { BROWSER_AUTH_SESSION_STORAGE_KEY } from '../src/lib/browser-auth-session.mjs';

const authBaseUrl = 'https://auth.bigfootds.dev';
const newsBaseUrl = 'https://news.bigfootds.dev';

test('renews once after a rejected staff list request without embedding editorial data in the page', async () => {
  window.localStorage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'access.initial',
    refreshToken: 'refresh.current'
  }));
  const calls = [];
  let newsRequestCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    calls.push({ init, url });
    if (url.origin === authBaseUrl) return json({ accessToken: `access.renewed-${calls.length}` });
    newsRequestCount += 1;
    if (newsRequestCount === 1) return new Response(null, { status: 401 });
    return json({
      pagination: { nextCursor: null },
      results: [{
        category: 'announcement',
        id: '0123456789abcdef01234567',
        locale: 'en-AU',
        projectId: 'website',
        publishAt: '2026-09-12T03:00:00.000Z',
        status: 'draft',
        summary: 'Safe staff summary.',
        tags: ['release'],
        title: 'Safe staff title',
        unpublishAt: null,
        updatedAt: '2026-09-12T03:00:00.000Z'
      }]
    });
  }));

  render(<StaffNewsDashboard apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByRole('link', { name: 'Safe staff title' });
  await waitFor(() => expect(newsRequestCount).toBe(2));
  const serviceCalls = calls.filter(({ url }) => url.origin === newsBaseUrl);
  expect(serviceCalls).toHaveLength(2);
  expect(serviceCalls[0].init.headers.get('Authorization')).toBe('Bearer access.renewed-1');
  expect(serviceCalls[1].init.headers.get('Authorization')).toBe('Bearer access.renewed-3');
  expect(serviceCalls[1].init.headers.get('refreshToken')).toBe('refresh.current');
  expect(screen.queryByText('private-staff-audit-data')).toBeNull();
});

test('does not render a new-draft editor when no stored staff session exists', async () => {
  window.localStorage.clear();

  render(<StaffNewsComposer apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByText('Your staff sign-in has ended. Please sign in again.');
  expect(screen.queryByRole('heading', { name: 'New News draft' })).toBeNull();
  expect(screen.queryByLabelText('Article')).toBeNull();
});

test('renders the new-draft composer only after MS-Auth verifies the stored session', async () => {
  window.localStorage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'access.initial',
    refreshToken: 'refresh.current'
  }));
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = new URL(input);
    if (url.origin !== authBaseUrl) throw new Error('New drafts must not fetch an editorial record.');
    return json({ accessToken: 'access.renewed', refreshToken: 'refresh.current' });
  }));

  render(<StaffNewsComposer apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByRole('heading', { name: 'New News draft' });
  expect(screen.getByRole('button', { name: 'Save draft' })).toBeTruthy();
  expect(globalThis.fetch).toHaveBeenCalledTimes(1);
});

test('updates the existing Tiptap instance when publication changes editability', async () => {
  const onChange = vi.fn();
  const onReady = vi.fn();
  const document = { content: [{ type: 'paragraph' }], type: 'doc' };
  const { container, rerender } = render(<StaffNewsRichEditor disabled document={document} onChange={onChange} onReady={onReady} />);

  await waitFor(() => expect(container.querySelector('.tiptap')?.getAttribute('contenteditable')).toBe('false'));
  rerender(<StaffNewsRichEditor disabled={false} document={document} onChange={onChange} onReady={onReady} />);
  await waitFor(() => expect(container.querySelector('.tiptap')?.getAttribute('contenteditable')).toBe('true'));
});

function json(value) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}

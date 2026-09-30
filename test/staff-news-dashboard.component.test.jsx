import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import StaffNewsComposer, { StaffNewsRichEditor } from '../src/components/StaffNewsComposer.jsx';
import StaffNewsDashboard from '../src/components/StaffNewsDashboard.jsx';
import { StaffNewsDocumentPreview } from '../src/components/StaffNewsDocumentPreview.jsx';
import { BROWSER_AUTH_SESSION_STORAGE_KEY } from '../src/lib/browser-auth-session.mjs';
import { createLocalNewsEditorDemo, createLocalNewsEditorDemoAssets } from '../src/lib/news-editor-local-demo.mjs';

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

test('uses a familiar grouped toolbar, link form, and same-document preview', async () => {
  const onChange = vi.fn();
  const onReady = vi.fn();
  const document = {
    content: [{ content: [{ text: 'A previewable paragraph.', type: 'text' }], type: 'paragraph' }],
    type: 'doc'
  };
  render(<StaffNewsRichEditor assets={[]} disabled={false} document={document} onChange={onChange} onReady={onReady} />);

  await screen.findByRole('toolbar', { name: 'Article formatting' });
  expect(screen.getByRole('group', { name: 'History' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Text style' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Link' }));
  expect(screen.getByLabelText('Link destination')).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  expect(screen.getByRole('article', { name: 'Article preview' })).toBeTruthy();
  expect(screen.getByText('A previewable paragraph.')).toBeTruthy();
});

test('renders the local demonstration document with preview-only media and a video', () => {
  const demo = createLocalNewsEditorDemo('en-AU');
  render(<StaffNewsDocumentPreview assets={createLocalNewsEditorDemoAssets()} document={demo.content[0].document} />);

  expect(screen.getByRole('heading', { name: 'Everything the News editor can display' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'clickable BigfootDS repository link' }).getAttribute('href')).toBe('https://github.com/BigfootDS');
  expect(screen.getAllByRole('img')).toHaveLength(3);
  expect(screen.getByTitle('Embedded YouTube video preview').getAttribute('src')).toContain('www.youtube-nocookie.com/embed/M7lc1UVf-VE');
});

test('loads the standalone local demonstration without a staff session or network request', async () => {
  window.history.replaceState({}, '', '/admin/news/editor/?demo=local&locale=en-AU');
  window.localStorage.clear();
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);

  render(<StaffNewsComposer apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByText('Local-only content demonstration loaded. It does not contact MS-Auth, MS-News, MongoDB, or a production service.');
  expect(screen.getByText(/DO NOT PUBLISH:/)).toBeTruthy();
  expect(screen.getByDisplayValue('DO NOT PUBLISH: News editor content demo')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save local demo draft' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Publish now' })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

test('keeps a verified image available for insertion when only its temporary preview fails', async () => {
  const postId = '0123456789abcdef01234567';
  const assetId = 'nma_0123456789abcdef0123456789abcdef';
  window.history.replaceState({}, '', `/admin/news/editor/?id=${postId}&locale=en-AU`);
  window.localStorage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'access.initial',
    refreshToken: 'refresh.current'
  }));
  const image = new File([new Uint8Array(42)], 'website.png', { type: 'image/png' });
  vi.stubGlobal('FormData', class {
    constructor(form) {
      this.form = form;
      this.entries = [];
    }

    append(name, value) {
      this.entries.push([name, value]);
    }

    get(name) {
      if (!this.form) return null;
      if (name === 'image') return image;
      if (name === 'alt') return 'Website overhaul preview';
      return '';
    }
  });
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = new URL(input);
    if (url.origin === authBaseUrl) return json({ accessToken: 'access.renewed', refreshToken: 'refresh.current' });
    if (url.pathname.endsWith(`/news/${postId}`)) return json({ result: draftPost(postId) });
    if (url.pathname.endsWith('/upload-intents')) return json({
      result: {
        assetId,
        expiresAt: '2030-09-12T03:10:00.000Z',
        upload: { formFields: { key: 'news-media/staging/opaque' }, method: 'POST', url: 'https://storage.example.test/upload' }
      }
    });
    if (url.origin === 'https://storage.example.test') return new Response(null, { status: 204 });
    if (url.pathname.endsWith(`/${assetId}/complete`)) return json({
      result: { assetId, byteLength: 42, contentType: 'image/png', dimensions: { height: 180, width: 320 }, status: 'ready' }
    });
    if (url.pathname.endsWith(`/${assetId}/preview`)) throw new Error('private preview transport failure');
    throw new Error(`Unexpected request ${url}`);
  }));

  render(<StaffNewsComposer apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByRole('heading', { name: 'Edit News record' });
  fireEvent.submit(screen.getByRole('button', { name: 'Upload and verify image' }).closest('form'));

  await screen.findByText('Image verified. Its temporary preview could not be loaded, but it can still be inserted into the article or selected for a gallery.');
  expect(screen.getByText('Temporary image preview unavailable.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Insert image' })).toBeTruthy();
  expect(screen.queryByText('private preview transport failure')).toBeNull();
});

test('uses the normal staff schedule route to publish a legacy article at its source date', async () => {
  const postId = '0123456789abcdef01234567';
  window.history.replaceState({}, '', `/admin/news/editor/?id=${postId}&locale=en-AU`);
  window.localStorage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'access.initial',
    refreshToken: 'refresh.current'
  }));
  const schedules = [];
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    if (url.origin === authBaseUrl) return json({ accessToken: 'access.renewed', refreshToken: 'refresh.current' });
    if (url.pathname.endsWith(`/news/${postId}`)) return json({ result: draftPost(postId) });
    if (url.pathname.endsWith('/schedule')) {
      schedules.push(JSON.parse(init.body));
      return json({ result: { ...draftPost(postId), publishAt: '2024-12-29T12:00:00.000Z', status: 'published' } });
    }
    throw new Error(`Unexpected request ${url}`);
  }));

  render(<StaffNewsComposer apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByRole('heading', { name: 'Edit News record' });
  fireEvent.change(screen.getByLabelText('Original publication date'), { target: { value: '2024-12-29' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Publish with historical date' }).closest('form'));

  await screen.findByText('News was published with its historical date.');
  expect(schedules).toEqual([{
    publishAt: '2024-12-29T12:00:00.000Z',
    unpublishAt: null
  }]);
});

test('keeps ordinary scheduling future-only and reserves historical dates for migration', async () => {
  const postId = '0123456789abcdef01234567';
  window.history.replaceState({}, '', `/admin/news/editor/?id=${postId}&locale=en-AU`);
  window.localStorage.setItem(BROWSER_AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    accessToken: 'access.initial',
    refreshToken: 'refresh.current'
  }));
  const schedules = [];
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = new URL(input);
    if (url.origin === authBaseUrl) return json({ accessToken: 'access.renewed', refreshToken: 'refresh.current' });
    if (url.pathname.endsWith(`/news/${postId}`)) return json({ result: draftPost(postId) });
    if (url.pathname.endsWith('/schedule')) {
      schedules.push(JSON.parse(init.body));
      return json({ result: { ...draftPost(postId), publishAt: '2030-01-02T12:00:00.000Z', status: 'published' } });
    }
    throw new Error(`Unexpected request ${url}`);
  }));

  render(<StaffNewsComposer apiBaseUrl={newsBaseUrl} authBaseUrl={authBaseUrl} />);

  await screen.findByRole('heading', { name: 'Edit News record' });
  const publicationForm = screen.getByRole('button', { name: 'Schedule publication' }).closest('form');
  fireEvent.change(screen.getByLabelText('Publish at (your local time)'), { target: { value: '2024-12-29T12:00' } });
  fireEvent.submit(publicationForm);
  await screen.findByText('Enter a future publishing time and, if needed, a later unpublish time.');
  expect(schedules).toEqual([]);

  fireEvent.change(screen.getByLabelText('Publish at (your local time)'), { target: { value: '2030-01-02T12:00' } });
  fireEvent.submit(publicationForm);
  await screen.findByText('News schedule saved.');
  expect(schedules).toHaveLength(1);
  expect(new Date(schedules[0].publishAt).getUTCFullYear()).toBe(2030);
  expect(schedules[0].unpublishAt).toBeNull();
});

function json(value) {
  return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
}

function draftPost(id) {
  return {
    category: 'announcement',
    content: [{
      body: 'Safe staff content.',
      locale: 'en-AU',
      summary: 'Safe staff summary.',
      title: 'Safe staff title'
    }],
    id,
    projectId: 'website',
    publishAt: '2026-09-12T03:00:00.000Z',
    status: 'draft',
    tags: ['release'],
    unpublishAt: null,
    updatedAt: '2026-09-12T03:00:00.000Z'
  };
}

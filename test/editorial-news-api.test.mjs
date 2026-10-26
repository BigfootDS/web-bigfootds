import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EditorialNewsApiError,
  createEditorialMediaUploadIntentRequest,
  createEditorialMediaPreviewRequest,
  createEditorialNewsListRequest,
  createEditorialNewsHistoricalPublicationInput,
  createEditorialNewsPostInput,
  createEditorialNewsPostRequest,
  createEditorialNewsScheduleInput,
  readEditorialMediaCompletion,
  readEditorialMediaUploadIntent,
  readEditorialMediaPreviewResponse,
  readEditorialNewsList,
  readEditorialNewsPost,
  readEditorialNewsPostResponse,
  readPublicEditorialNewsBaseUrl
} from '../src/lib/editorial-news-api.mjs';

const apiBaseUrl = 'https://news.bigfootds.dev/';
const session = { accessToken: 'access.token-1', refreshToken: 'refresh.token-1' };
const postId = '0123456789abcdef01234567';
const assetId = 'nma_0123456789abcdef0123456789abcdef';

test('requires a bare public MS-News origin and uses the documented direct-client staff transport', () => {
  assert.equal(readPublicEditorialNewsBaseUrl(apiBaseUrl), 'https://news.bigfootds.dev');
  assert.equal(readPublicEditorialNewsBaseUrl('http://localhost:3031'), 'http://localhost:3031');
  assert.throws(() => readPublicEditorialNewsBaseUrl('https://news.bigfootds.dev/api/v1'), isConfigurationError);

  const list = createEditorialNewsListRequest({
    apiBaseUrl,
    limit: 20,
    locale: 'en-AU',
    session,
    status: 'draft'
  });
  assert.equal(list.url.href, 'https://news.bigfootds.dev/api/v1/editorial/news?locale=en-AU&limit=20&status=draft');
  assert.equal(list.init.headers.get('Authorization'), 'Bearer access.token-1');
  assert.equal(list.init.headers.get('accessToken'), session.accessToken);
  assert.equal(list.init.headers.get('refreshToken'), session.refreshToken);
  assert.equal(list.init.credentials, 'omit');
  assert.equal(list.init.referrerPolicy, 'no-referrer');

  const create = createEditorialNewsPostRequest({
    apiBaseUrl,
    body: validPostInput(),
    id: '',
    operation: 'create',
    session
  });
  assert.equal(create.url.href, 'https://news.bigfootds.dev/api/v1/editorial/news');
  assert.equal(create.init.method, 'POST');
});

test('serialises only validated editor fields and a strict UTC schedule', () => {
  const now = new Date('2026-09-11T12:00:00.000Z');
  assert.deepEqual(createEditorialNewsPostInput({
    category: 'announcement',
    contents: [{ document: validDocument(), locale: 'en-AU', summary: 'A safe summary.', title: 'A safe title' }],
    projectId: 'website',
    tags: ['release']
  }), validPostInput());
  assert.deepEqual(createEditorialNewsScheduleInput({
    now,
    publishAt: '2026-09-12T04:00:00.000Z',
    unpublishAt: ''
  }), {
    publishAt: '2026-09-12T04:00:00.000Z',
    unpublishAt: null
  });
  assert.throws(() => createEditorialNewsScheduleInput({
    now,
    publishAt: '2026-09-12T04:00:00.000Z',
    unpublishAt: '2026-09-12T03:00:00.000Z'
  }), isValidationError);
  assert.throws(() => createEditorialNewsScheduleInput({
    now,
    publishAt: '2026-09-11T12:00:00.000Z',
    unpublishAt: ''
  }), isValidationError);
});

test('turns a historical calendar date into a stable immediate publication window', () => {
  const now = new Date('2026-09-30T12:00:00.000Z');
  assert.deepEqual(createEditorialNewsHistoricalPublicationInput({ now, publishedOn: '2024-12-29' }), {
    publishAt: '2024-12-29T12:00:00.000Z',
    unpublishAt: null
  });
  assert.throws(() => createEditorialNewsHistoricalPublicationInput({ now, publishedOn: '2024-02-30' }), isValidationError);
  assert.throws(() => createEditorialNewsHistoricalPublicationInput({ now, publishedOn: '29-12-2024' }), isValidationError);
  assert.throws(() => createEditorialNewsHistoricalPublicationInput({ now, publishedOn: '2026-10-01' }), isValidationError);
});

test('accepts staff-safe list and full record shapes, but rejects audit data and unsafe document fields', () => {
  const list = readEditorialNewsList({
    pagination: { nextCursor: null },
    results: [{
      category: 'announcement',
      id: postId,
      locale: 'en-AU',
      projectId: 'website',
      publishAt: '2026-09-12T03:00:00.000Z',
      status: 'draft',
      summary: 'A safe summary.',
      tags: ['release'],
      title: 'A safe title',
      unpublishAt: null,
      updatedAt: '2026-09-12T03:00:00.000Z'
    }]
  });
  assert.equal(list.results[0].title, 'A safe title');
  assert.equal(list.nextCursor, undefined);

  const post = readEditorialNewsPost({
    result: {
      category: 'announcement',
      content: [{
        body: 'A safe document.',
        document: validDocument(),
        locale: 'en-AU',
        summary: 'A safe summary.',
        title: 'A safe title'
      }],
      id: postId,
      projectId: 'website',
      publishAt: '2026-09-12T03:00:00.000Z',
      status: 'draft',
      tags: ['release'],
      unpublishAt: null,
      updatedAt: '2026-09-12T03:00:00.000Z'
    }
  });
  assert.equal(post.content[0].document.format, 'tiptap-json-v1');

  assert.throws(() => readEditorialNewsPost({
    result: { ...post, createdByAuthUserId: 'private-staff-audit-data' }
  }), isInvalidResponseError);
  assert.throws(() => readEditorialNewsList({ pagination: { nextCursor: null }, results: [{ ...list.results[0], unexpected: true }] }), isInvalidResponseError);
});

test('keeps the upload form capability separate from user credentials and rejects malformed media responses', () => {
  const intentRequest = createEditorialMediaUploadIntentRequest({
    apiBaseUrl,
    byteLength: 42,
    contentType: 'image/png',
    session
  });
  assert.equal(intentRequest.init.headers.get('Authorization'), 'Bearer access.token-1');
  assert.deepEqual(JSON.parse(intentRequest.init.body), { byteLength: 42, contentType: 'image/png' });

  const upload = readEditorialMediaUploadIntent({
    result: {
      assetId,
      expiresAt: '2030-09-12T03:10:00.000Z',
      upload: {
        formFields: { key: 'news-media/staging/opaque' },
        method: 'POST',
        url: 'https://storage.googleapis.com/example-bucket'
      }
    }
  });
  assert.equal(upload.assetId, assetId);
  assert.equal(upload.upload.method, 'POST');

  const completed = readEditorialMediaCompletion({
    result: {
      assetId,
      byteLength: 42,
      contentType: 'image/png',
      dimensions: { height: 180, width: 320 },
      status: 'ready'
    }
  });
  assert.deepEqual(completed.dimensions, { height: 180, width: 320 });
  assert.throws(() => readEditorialMediaUploadIntent({ result: { ...upload, storageObjectKey: 'private' } }), isInvalidResponseError);
});

test('requests JSON preview capability with only the bearer credential and refuses redirects', () => {
  const request = createEditorialMediaPreviewRequest({ apiBaseUrl, assetId, session });

  assert.equal(request.url.href, `https://news.bigfootds.dev/api/v1/editorial/news-media/${assetId}/preview-capability`);
  assert.equal(request.init.headers.get('accept'), 'application/json');
  assert.equal(request.init.headers.get('Authorization'), 'Bearer access.token-1');
  assert.equal(request.init.headers.get('accessToken'), null);
  assert.equal(request.init.headers.get('refreshToken'), null);
  assert.equal(request.init.credentials, 'omit');
  assert.equal(request.init.referrerPolicy, 'no-referrer');
  assert.equal(request.init.redirect, 'error');
});

const previewUrl = 'https://storage.googleapis.com/news-test/news-media/v1/image/verified?X-Goog-Signature=fixture-only';

test('starts a fresh storage read without a session and returns only a blob URL', async () => {
  let requested;
  let retainedImage;
  const result = await readEditorialMediaPreviewResponse({
    response: previewCapability(),
    fetchImpl: async (url, init) => {
      requested = { init, url };
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } });
    },
    urlApi: { createObjectURL: (image) => { retainedImage = image; return 'blob:private-preview'; } }
  });
  assert.equal(result, 'blob:private-preview');
  assert.equal(requested.url.href, previewUrl);
  assert.equal(requested.init.method, 'GET');
  assert.equal(requested.init.mode, 'cors');
  assert.equal(requested.init.credentials, 'omit');
  assert.equal(requested.init.redirect, 'error');
  assert.equal(requested.init.cache, 'no-store');
  assert.equal(requested.init.referrerPolicy, 'no-referrer');
  assert.deepEqual([...requested.init.headers.entries()], [['accept', 'image/*']]);
  assert.equal(retainedImage.type, 'image/png');
  assert.equal(retainedImage.size, 3);
});

test('rejects malformed capabilities before any storage request and hides their contents', async () => {
  let reads = 0;
  const values = [null, [], {}, { result: {} }, { result: { url: previewUrl }, extra: true },
    { result: { url: previewUrl, extra: true } }, ...[
      undefined, 42, 'not a URL', 'http://storage.googleapis.com/image', 'https://other.example/image',
      'https://user:password@storage.googleapis.com/image', 'https://:password@storage.googleapis.com/image', previewUrl + '#fragment',
      'https://storage.googleapis.com:8443/image', ' ' + previewUrl, previewUrl + 'a'.repeat(8_192)
    ].map((url) => ({ result: { url } }))];
  for (const value of values) {
    await assert.rejects(readEditorialMediaPreviewResponse({
      response: new Response(JSON.stringify(value)),
      fetchImpl: async () => { reads += 1; throw new Error('Unexpected storage read.'); }
    }), (error) => error instanceof EditorialNewsApiError && error.kind === 'invalid-response' && !error.message.includes(previewUrl));
  }
  await assert.rejects(readEditorialMediaPreviewResponse({ response: new Response('not JSON') }), isInvalidResponseError);
  const redirected = previewCapability();
  Object.defineProperty(redirected, 'redirected', { value: true });
  await assert.rejects(readEditorialMediaPreviewResponse({ response: redirected }), isInvalidResponseError);
  assert.equal(reads, 0);
});

test('keeps capability denial and storage failures safe without creating a preview', async () => {
  let reads = 0;
  for (const [status, kind] of [[401, 'rejected'], [404, 'not-found'], [503, 'unavailable']]) {
    await assert.rejects(readEditorialMediaPreviewResponse({
      response: new Response(null, { status }),
      fetchImpl: async () => { reads += 1; }
    }), (error) => error instanceof EditorialNewsApiError && error.kind === kind);
  }
  assert.equal(reads, 0);
  await assert.rejects(readEditorialMediaPreviewResponse({
    response: previewCapability(), fetchImpl: async () => { throw new Error(previewUrl); }
  }), (error) => error instanceof EditorialNewsApiError && error.kind === 'unavailable' && !error.message.includes(previewUrl));
  await assert.rejects(readEditorialMediaPreviewResponse({
    response: previewCapability(), fetchImpl: async () => new Response('provider detail', { status: 403 })
  }), (error) => error instanceof EditorialNewsApiError && error.kind === 'rejected');
});

test('accepts only bounded image blobs and cleans up invalid transport results before allocation', async () => {
  let allocations = 0;
  const invalidImages = [
    new Response('<html>provider failure</html>', { headers: { 'content-type': 'text/html' } }),
    new Response(null, { headers: { 'content-type': 'image/png' } }),
    new Response(new Uint8Array(10 * 1024 * 1024 + 1), { headers: { 'content-type': 'image/png' } }),
    { ok: true, blob: async () => { throw new Error('Unreadable image.'); } }
  ];
  const redirected = new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
  Object.defineProperty(redirected, 'redirected', { value: true });
  invalidImages.push(redirected);
  for (const imageResponse of invalidImages) {
    await assert.rejects(readEditorialMediaPreviewResponse({
      response: previewCapability(), fetchImpl: async () => imageResponse,
      urlApi: { createObjectURL: () => { allocations += 1; return 'blob:unexpected'; } }
    }), isInvalidResponseError);
  }
  assert.equal(allocations, 0);
  assert.equal(await readEditorialMediaPreviewResponse({
    response: previewCapability(),
    fetchImpl: async () => new Response(new Uint8Array(10 * 1024 * 1024), { headers: { 'content-type': 'image/webp' } }),
    urlApi: { createObjectURL: () => 'blob:maximum-image' }
  }), 'blob:maximum-image');
  await assert.rejects(readEditorialMediaPreviewResponse({
    response: previewCapability(),
    fetchImpl: async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }),
    urlApi: { createObjectURL: () => { throw new Error('Allocation failed.'); } }
  }), isInvalidResponseError);
});

function previewCapability() {
  return new Response(JSON.stringify({ result: { url: previewUrl } }), { headers: { 'content-type': 'application/json' } });
}

test('keeps server-side content validation distinct from session rejection', async () => {
  await assert.rejects(
    readEditorialNewsPostResponse(new Response(null, { status: 400 })),
    isValidationError
  );
  await assert.rejects(
    readEditorialNewsPostResponse(new Response(null, { status: 403 })),
    (error) => error instanceof EditorialNewsApiError && error.kind === 'rejected'
  );
});

function validDocument() {
  return {
    content: [{ content: [{ text: 'A safe document.', type: 'text' }], type: 'paragraph' }],
    format: 'tiptap-json-v1',
    type: 'doc'
  };
}

function validPostInput() {
  return {
    category: 'announcement',
    content: [{
      document: validDocument(),
      locale: 'en-AU',
      summary: 'A safe summary.',
      title: 'A safe title'
    }],
    projectId: 'website',
    tags: ['release']
  };
}

function isConfigurationError(error) {
  return error instanceof EditorialNewsApiError && error.kind === 'configuration';
}

function isInvalidResponseError(error) {
  return error instanceof EditorialNewsApiError && error.kind === 'invalid-response';
}

function isValidationError(error) {
  return error instanceof EditorialNewsApiError && error.kind === 'validation';
}

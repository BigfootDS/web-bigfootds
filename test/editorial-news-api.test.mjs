import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EditorialNewsApiError,
  createEditorialMediaUploadIntentRequest,
  createEditorialNewsListRequest,
  createEditorialNewsPostInput,
  createEditorialNewsPostRequest,
  createEditorialNewsScheduleInput,
  readEditorialMediaCompletion,
  readEditorialMediaUploadIntent,
  readEditorialNewsList,
  readEditorialNewsPost,
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
  assert.deepEqual(createEditorialNewsPostInput({
    category: 'announcement',
    contents: [{ document: validDocument(), locale: 'en-AU', summary: 'A safe summary.', title: 'A safe title' }],
    projectId: 'website',
    tags: ['release']
  }), validPostInput());
  assert.deepEqual(createEditorialNewsScheduleInput({
    publishAt: '2026-09-12T04:00:00.000Z',
    unpublishAt: ''
  }), {
    publishAt: '2026-09-12T04:00:00.000Z',
    unpublishAt: null
  });
  assert.throws(() => createEditorialNewsScheduleInput({
    publishAt: '2026-09-12T04:00:00.000Z',
    unpublishAt: '2026-09-12T03:00:00.000Z'
  }), isValidationError);
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

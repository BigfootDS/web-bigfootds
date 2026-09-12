import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_NEWS_LOCALE,
  fetchPublicNews,
  readNewsApiBaseUrl,
  writePublicNewsSnapshot
} from '../scripts/news-publication.mjs';

const firstId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const secondId = 'bbbbbbbbbbbbbbbbbbbbbbbb';

function publicPost(id, overrides = {}) {
  const { content: contentOverrides = {}, ...postOverrides } = overrides;

  return {
    category: 'release',
    content: {
      body: 'A public release body.',
      locale: DEFAULT_NEWS_LOCALE,
      summary: 'A public release summary.',
      title: 'A public release',
      ...contentOverrides
    },
    id,
    projectId: 'bigfootds',
    publishAt: '2026-09-12T00:00:00.000Z',
    tags: ['announcement'],
    ...postOverrides
  };
}

function page(results, nextCursor) {
  return {
    pagination: nextCursor === undefined ? {} : { nextCursor },
    results
  };
}

test('requires a bare public MS-News HTTP(S) origin', () => {
  assert.equal(readNewsApiBaseUrl('https://news.example.test/'), 'https://news.example.test');
  assert.throws(
    () => readNewsApiBaseUrl(undefined),
    /MS_NEWS_BASE_URL is required/
  );
  assert.throws(
    () => readNewsApiBaseUrl('https://news.example.test/api/v1/news'),
    /bare public HTTP\(S\) origin/
  );
  assert.throws(
    () => readNewsApiBaseUrl('https://user:password@news.example.test'),
    /bare public HTTP\(S\) origin/
  );
});

test('pages, validates, and sorts public locale-selected news deterministically', async () => {
  const requests = [];
  const snapshot = await fetchPublicNews({
    apiBaseUrl: 'https://news.example.test',
    fetchImpl: async (url) => {
      requests.push(url.toString());
      const cursor = url.searchParams.get('cursor');
      const response = cursor === null
        ? page([publicPost(firstId, { publishAt: '2026-09-11T00:00:00.000Z' })], 'next-page')
        : page([publicPost(secondId, { publishAt: '2026-09-12T00:00:00.000Z' })]);

      return new Response(JSON.stringify(response), { status: 200 });
    }
  });

  assert.deepEqual(requests, [
    'https://news.example.test/api/v1/news?locale=en-AU&limit=50',
    'https://news.example.test/api/v1/news?locale=en-AU&limit=50&cursor=next-page'
  ]);
  assert.deepEqual(snapshot.posts.map((post) => post.id), [secondId, firstId]);
  assert.equal(snapshot.locale, DEFAULT_NEWS_LOCALE);
  assert.equal(snapshot.mediaDeliveryBaseUrl, 'https://news.example.test/api/v1/news/media/');
  assert.equal(snapshot.version, 2);
});

test('derives a rich post snapshot body only from the validated document', async () => {
  const snapshot = await fetchPublicNews({
    apiBaseUrl: 'https://news.example.test',
    fetchImpl: async () => new Response(JSON.stringify(page([
      publicPost(firstId, {
        content: {
          body: 'Untrusted duplicate body',
          document: {
            content: [{
              content: [{ text: 'Safe static announcement', type: 'text' }],
              type: 'paragraph'
            }, {
              attrs: {
                alt: 'A verified release screenshot',
                assetId: 'nma_0123456789abcdef0123456789abcdef'
              },
              type: 'image'
            }],
            format: 'tiptap-json-v1',
            type: 'doc'
          }
        }
      })
    ])), { status: 200 })
  });

  assert.equal(snapshot.posts[0].content.body, 'Safe static announcement A verified release screenshot');
  assert.equal(snapshot.posts[0].content.document?.format, 'tiptap-json-v1');
});

test('fails rather than publishing malformed, duplicated, or looping public data', async () => {
  await assert.rejects(
    fetchPublicNews({
      apiBaseUrl: 'https://news.example.test',
      fetchImpl: async () => new Response(JSON.stringify(page([
        publicPost(firstId, { content: { locale: 'ja-JP' } })
      ])), { status: 200 })
    }),
    /while en-AU was requested/
  );

  await assert.rejects(
    fetchPublicNews({
      apiBaseUrl: 'https://news.example.test',
      fetchImpl: async () => new Response(JSON.stringify(page([], 'same-cursor')), { status: 200 })
    }),
    /repeated public news cursor/
  );
  await assert.rejects(
    fetchPublicNews({
      apiBaseUrl: 'https://news.example.test',
      fetchImpl: async () => new Response(JSON.stringify(page([
        publicPost(firstId, {
          content: {
            document: {
              content: [{ attrs: { src: 'https://untrusted.example/image.png' }, type: 'image' }],
              format: 'tiptap-json-v1',
              type: 'doc'
            }
          }
        })
      ])), { status: 200 })
    }),
    /unexpected rich content field/
  );
});

test('replaces the snapshot so stale generated posts are not retained', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bigfootds-news-'));
  const outputPath = join(directory, 'public-news.json');
  const firstSnapshot = {
    locale: DEFAULT_NEWS_LOCALE,
    mediaDeliveryBaseUrl: 'https://news.example.test/api/v1/news/media/',
    posts: [publicPost(firstId)],
    version: 2
  };
  const emptySnapshot = {
    locale: DEFAULT_NEWS_LOCALE,
    mediaDeliveryBaseUrl: 'https://news.example.test/api/v1/news/media/',
    posts: [],
    version: 2
  };

  await writePublicNewsSnapshot(outputPath, firstSnapshot);
  await writePublicNewsSnapshot(outputPath, emptySnapshot);

  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), emptySnapshot);
});

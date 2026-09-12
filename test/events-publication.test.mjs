import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  fetchPublicEvents,
  readEventsApiBaseUrl,
  readPublicEventsSnapshot,
  writePublicEventsSnapshot
} from '../scripts/events-publication.mjs';

const firstId = 'evt_0123456789abcdef0123456789abcdef';
const secondId = 'evt_fedcba9876543210fedcba9876543210';

function publicEvent(id, overrides = {}) {
  return {
    id,
    projectId: 'thebestestbeehive',
    startsAt: '2026-09-12T00:00:00.000Z',
    summary: 'A short public Event summary.',
    tags: ['event'],
    title: 'A public Event',
    ...overrides
  };
}

function page(items, nextCursor) {
  return {
    items,
    ...(nextCursor === undefined ? {} : { nextCursor })
  };
}

test('requires a bare public MS-LiveOpsConfig HTTP(S) origin', () => {
  assert.equal(readEventsApiBaseUrl('https://liveops.example.test/'), 'https://liveops.example.test');
  assert.throws(() => readEventsApiBaseUrl(undefined), /MS_LIVEOPSCONFIG_BASE_URL is required/);
  assert.throws(() => readEventsApiBaseUrl('https://liveops.example.test/api/v1/events'), /bare public HTTP\(S\) origin/);
  assert.throws(() => readEventsApiBaseUrl('https://user:password@liveops.example.test'), /bare public HTTP\(S\) origin/);
});

test('pages and validates the public Event catalogue before deterministically sorting it', async () => {
  const requests = [];
  const snapshot = await fetchPublicEvents({
    apiBaseUrl: 'https://liveops.example.test',
    fetchImpl: async (url) => {
      requests.push(url.toString());
      return new Response(JSON.stringify(url.searchParams.get('cursor') === null
        ? page([publicEvent(firstId, { startsAt: '2026-09-11T00:00:00.000Z' })], 'next-page')
        : page([publicEvent(secondId)])), { status: 200 });
    }
  });

  assert.deepEqual(requests, [
    'https://liveops.example.test/api/v1/events?limit=50',
    'https://liveops.example.test/api/v1/events?limit=50&cursor=next-page'
  ]);
  assert.deepEqual(snapshot.events.map((event) => event.id), [secondId, firstId]);
  assert.equal(snapshot.version, 1);
});

test('fails rather than publishing private, duplicated, looping, or malformed Event data', async () => {
  await assert.rejects(fetchPublicEvents({
    apiBaseUrl: 'https://liveops.example.test',
    fetchImpl: async () => new Response(JSON.stringify(page([publicEvent(firstId, { payload: { private: true } })])), { status: 200 })
  }), /non-public fields/);

  await assert.rejects(fetchPublicEvents({
    apiBaseUrl: 'https://liveops.example.test',
    fetchImpl: async () => new Response(JSON.stringify(page([], 'same-cursor')), { status: 200 })
  }), /repeated public Events cursor/);

  await assert.rejects(fetchPublicEvents({
    apiBaseUrl: 'https://liveops.example.test',
    fetchImpl: async () => new Response(JSON.stringify(page([publicEvent('spring-festival')])), { status: 200 })
  }), /invalid opaque id/);

  await assert.rejects(fetchPublicEvents({
    apiBaseUrl: 'https://liveops.example.test',
    fetchImpl: async () => new Response(JSON.stringify(page([publicEvent(firstId.toUpperCase())])), { status: 200 })
  }), /invalid opaque id/);

  await assert.rejects(fetchPublicEvents({
    apiBaseUrl: 'https://liveops.example.test',
    fetchImpl: async () => new Response(JSON.stringify({ ...page([]), privateField: true }), { status: 200 })
  }), /non-public Events page fields/);
});

test('replaces and revalidates the generated snapshot', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'bigfootds-events-'));
  const outputPath = join(directory, 'public-events.json');
  await writePublicEventsSnapshot(outputPath, { events: [publicEvent(firstId)], version: 1 });
  await writePublicEventsSnapshot(outputPath, { events: [], version: 1 });

  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), { events: [], version: 1 });
  assert.deepEqual(await readPublicEventsSnapshot(outputPath), { events: [], version: 1 });

  await writePublicEventsSnapshot(outputPath, { events: [publicEvent(firstId), publicEvent(firstId)], version: 1 });
  await assert.rejects(readPublicEventsSnapshot(outputPath), /duplicate identifiers/);
});

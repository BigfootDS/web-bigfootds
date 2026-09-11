import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_OPS_PAGE_SIZE,
  MAXIMUM_LIVE_OPS_QUERY_LENGTH,
  createLiveOpsCatalogueUrl,
  createPublicLiveOpsRequestInit,
  readLiveOpsCursor,
  readLiveOpsFilters,
  readPublicLiveOpsCatalogue,
  serialiseLiveOpsFilters
} from '../src/lib/liveops-discovery.mjs';

const publicCatalogue = {
  items: [{
    configType: 'event_schedule',
    endsAt: '2026-09-13T00:00:00.000Z',
    id: 'spring-event',
    projectId: 'thebestestbeehive',
    startsAt: '2026-09-12T00:00:00.000Z',
    summary: 'A short public event summary.',
    tags: ['event', 'spring'],
    title: 'Spring event'
  }],
  nextCursor: 'cGFnZTox'
};

test('reads and serialises bounded, shareable public catalogue filters', () => {
  const filters = readLiveOpsFilters(new URLSearchParams(
    'q=%20SPRING%20&project=thebestestbeehive&type=event_schedule&tag=event'
  ));

  assert.deepEqual(filters, {
    project: 'thebestestbeehive',
    q: 'SPRING',
    tag: 'event',
    type: 'event_schedule'
  });
  assert.deepEqual(readLiveOpsFilters(new URLSearchParams('project=../../private&type=not%20valid')), {});
  assert.equal(readLiveOpsFilters(new URLSearchParams(`q=${'q'.repeat(MAXIMUM_LIVE_OPS_QUERY_LENGTH + 1)}`)).q.length, MAXIMUM_LIVE_OPS_QUERY_LENGTH);
  assert.equal(
    serialiseLiveOpsFilters(filters, 'cGFnZTox').toString(),
    'q=SPRING&project=thebestestbeehive&type=event_schedule&tag=event&cursor=cGFnZTox'
  );
  assert.equal(readLiveOpsCursor(new URLSearchParams('cursor=cGFnZTox')), 'cGFnZTox');
  assert.equal(readLiveOpsCursor(new URLSearchParams('cursor=not%20opaque')), undefined);
});

test('builds an anonymous public catalogue request from a bare public origin', () => {
  const url = createLiveOpsCatalogueUrl('https://liveops.bigfootds.dev', {
    q: 'Spring',
    project: 'thebestestbeehive',
    tag: 'event',
    type: 'event_schedule'
  }, 'cGFnZTox');

  assert.equal(url.toString(), `https://liveops.bigfootds.dev/api/v1/live-ops/public?q=Spring&project=thebestestbeehive&type=event_schedule&tag=event&cursor=cGFnZTox&limit=${LIVE_OPS_PAGE_SIZE}`);
  assert.throws(() => createLiveOpsCatalogueUrl('https://user:pass@liveops.bigfootds.dev', {}), /bare HTTPS origin/);
  assert.throws(() => createLiveOpsCatalogueUrl('https://liveops.bigfootds.dev/api', {}), /bare HTTPS origin/);
  assert.equal(createLiveOpsCatalogueUrl('http://127.0.0.1:8080', {}).origin, 'http://127.0.0.1:8080');
});

test('accepts only the small documented public catalogue DTO', () => {
  assert.deepEqual(readPublicLiveOpsCatalogue(publicCatalogue), publicCatalogue);
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], payload: { secret: true } }] }),
    /non-public fields/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], configKey: 'internal-key' }] }),
    /non-public fields/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: Array.from({ length: 101 }, () => publicCatalogue.items[0]) }),
    /invalid public catalogue response/
  );
});

test('uses an anonymous, no-referrer request for public catalogue reads', () => {
  const controller = new AbortController();
  const request = createPublicLiveOpsRequestInit(controller.signal);

  assert.equal(request.cache, 'no-store');
  assert.equal(request.credentials, 'omit');
  assert.deepEqual(request.headers, { accept: 'application/json' });
  assert.equal(request.referrerPolicy, 'no-referrer');
  assert.equal(request.signal, controller.signal);
});

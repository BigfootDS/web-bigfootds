import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_OPS_PAGE_SIZE,
  createEventDetailUrl,
  MAXIMUM_LIVE_OPS_QUERY_LENGTH,
  createLiveOpsCatalogueUrl,
  createLatestLiveOpsRequestCoordinator,
  createPublicLiveOpsRequestInit,
  readLiveOpsCursor,
  readLiveOpsFilters,
  readPublicLiveOpsCatalogue,
  readPublicLiveOpsEvent,
  serialiseLiveOpsFilters
} from '../src/lib/liveops-discovery.mjs';

const publicCatalogue = {
  items: [{
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
    'q=%20SPRING%20&project=thebestestbeehive&tag=event'
  ));

  assert.deepEqual(filters, {
    project: 'thebestestbeehive',
    q: 'SPRING',
    tag: 'event'
  });
  assert.deepEqual(readLiveOpsFilters(new URLSearchParams('project=../../private')), {});
  assert.equal(MAXIMUM_LIVE_OPS_QUERY_LENGTH, 100);
  assert.equal(readLiveOpsFilters(new URLSearchParams(`q=${'q'.repeat(MAXIMUM_LIVE_OPS_QUERY_LENGTH + 1)}`)).q.length, MAXIMUM_LIVE_OPS_QUERY_LENGTH);
  assert.equal(
    serialiseLiveOpsFilters(filters, 'cGFnZTox').toString(),
    'q=SPRING&project=thebestestbeehive&tag=event&cursor=cGFnZTox'
  );
  assert.equal(readLiveOpsCursor(new URLSearchParams('cursor=cGFnZTox')), 'cGFnZTox');
  assert.equal(readLiveOpsCursor(new URLSearchParams('cursor=not%20opaque')), undefined);
});

test('builds an anonymous public catalogue request from a bare public origin', () => {
  const url = createLiveOpsCatalogueUrl('https://liveops.bigfootds.dev', {
    q: 'Spring',
    project: 'thebestestbeehive',
    tag: 'event'
  }, 'cGFnZTox');

  assert.equal(url.toString(), `https://liveops.bigfootds.dev/api/v1/events?q=Spring&project=thebestestbeehive&tag=event&cursor=cGFnZTox&limit=${LIVE_OPS_PAGE_SIZE}`);
  assert.throws(() => createLiveOpsCatalogueUrl(undefined, {}), /PUBLIC_MS_LIVEOPSCONFIG_BASE_URL is required/);
  assert.throws(() => createLiveOpsCatalogueUrl('https://user:pass@liveops.bigfootds.dev', {}), /bare HTTPS origin/);
  assert.throws(() => createLiveOpsCatalogueUrl('https://liveops.bigfootds.dev/api', {}), /bare HTTPS origin/);
  assert.equal(createLiveOpsCatalogueUrl('http://127.0.0.1:8080', {}).origin, 'http://127.0.0.1:8080');
  assert.equal(
    createEventDetailUrl('https://liveops.bigfootds.dev', 'evt_0123456789abcdef0123456789abcdef').toString(),
    'https://liveops.bigfootds.dev/api/v1/events/evt_0123456789abcdef0123456789abcdef'
  );
  assert.throws(() => createEventDetailUrl('https://liveops.bigfootds.dev', '../private-key'), /Event ID must be a lowercase stable identifier/);
});

test('accepts only the small documented public catalogue DTO', () => {
  assert.deepEqual(readPublicLiveOpsCatalogue(publicCatalogue), publicCatalogue);
  assert.doesNotThrow(() => readPublicLiveOpsCatalogue({
    items: [{
      ...publicCatalogue.items[0],
      summary: 's'.repeat(600),
      tags: Array.from({ length: 12 }, (_, index) => `tag-${index}`),
      title: 't'.repeat(160)
    }]
  }));
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], payload: { secret: true } }] }),
    /non-public fields/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], configKey: 'internal-key' }] }),
    /non-public fields/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], configType: 'event_schedule' }] }),
    /non-public fields/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], title: 't'.repeat(161) }] }),
    /invalid title/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: [{ ...publicCatalogue.items[0], endsAt: publicCatalogue.items[0].startsAt }] }),
    /ends before it starts/
  );
  assert.throws(
    () => readPublicLiveOpsCatalogue({ items: Array.from({ length: 101 }, () => publicCatalogue.items[0]) }),
    /invalid public response/
  );
  assert.deepEqual(readPublicLiveOpsEvent({ event: publicCatalogue.items[0] }), publicCatalogue.items[0]);
  assert.throws(
    () => readPublicLiveOpsEvent({ event: { ...publicCatalogue.items[0], payload: { secret: true } } }),
    /non-public fields/
  );
  assert.throws(
    () => readPublicLiveOpsEvent({ event: publicCatalogue.items[0], nextCursor: 'not-allowed' }),
    /invalid public event response/
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

test('marks an older page request stale after a newer request begins', () => {
  const coordinator = createLatestLiveOpsRequestCoordinator();
  const firstRequestIsCurrent = coordinator.begin();
  const secondRequestIsCurrent = coordinator.begin();

  assert.equal(firstRequestIsCurrent(), false);
  assert.equal(secondRequestIsCurrent(), true);
});

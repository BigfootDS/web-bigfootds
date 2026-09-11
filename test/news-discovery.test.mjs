import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAXIMUM_DISCOVERY_ITEM_COUNT,
  MAXIMUM_DISCOVERY_PAYLOAD_CHARACTERS,
  MAXIMUM_DISCOVERY_SUMMARY_LENGTH,
  MAXIMUM_DISCOVERY_TITLE_LENGTH,
  createNewsDiscoveryIndex,
  filterPublicNews,
  getNewsFilterOptions,
  readNewsFilters,
  serialiseNewsFilters
} from '../src/lib/news-discovery.mjs';

const sourcePosts = [
  {
    category: 'release',
    content: {
      body: 'The game client now has a much friendlier settings screen.',
      summary: 'A settings update for players.',
      title: 'Player settings release'
    },
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    projectId: 'playergamedata',
    publishAt: '2026-09-12T00:00:00.000Z',
    tags: ['announcement', 'settings']
  },
  {
    category: 'community',
    content: {
      body: 'Join the multiplayer session test this weekend.',
      summary: 'A community play session.',
      title: 'Weekend multiplayer session'
    },
    id: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    projectId: 'multiplayersessionbroker',
    publishAt: '2026-09-11T00:00:00.000Z',
    tags: ['community']
  }
];

const posts = createNewsDiscoveryIndex(sourcePosts);

test('creates a bounded discovery index without article bodies', () => {
  const index = createNewsDiscoveryIndex([{
    ...sourcePosts[0],
    content: {
      ...sourcePosts[0].content,
      body: '</script><script>window.executed = true</script>'
    }
  }]);

  assert.deepEqual(index[0], {
    category: 'release',
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    projectId: 'playergamedata',
    publishAt: '2026-09-12T00:00:00.000Z',
    summary: 'A settings update for players.',
    tags: ['announcement', 'settings'],
    title: 'Player settings release'
  });
  assert.doesNotMatch(JSON.stringify(index), /<\/?script/i);
  assert.equal('body' in index[0], false);
  assert.equal('content' in index[0], false);
});

test('fails the build when the discovery item or field bounds are exceeded', () => {
  assert.throws(
    () => createNewsDiscoveryIndex(Array.from({ length: MAXIMUM_DISCOVERY_ITEM_COUNT + 1 }, () => sourcePosts[0])),
    /supports at most/
  );
  assert.throws(
    () => createNewsDiscoveryIndex([{
      ...sourcePosts[0],
      content: {
        ...sourcePosts[0].content,
        summary: 'x'.repeat(MAXIMUM_DISCOVERY_SUMMARY_LENGTH + 1)
      }
    }]),
    /invalid summary/
  );

  const oversizedPayloadPosts = Array.from({ length: MAXIMUM_DISCOVERY_ITEM_COUNT }, (_, index) => ({
    ...sourcePosts[0],
    content: {
      ...sourcePosts[0].content,
      summary: 's'.repeat(MAXIMUM_DISCOVERY_SUMMARY_LENGTH),
      title: 't'.repeat(MAXIMUM_DISCOVERY_TITLE_LENGTH)
    },
    id: String(index).padStart(24, '0')
  }));

  assert.throws(
    () => createNewsDiscoveryIndex(oversizedPayloadPosts),
    new RegExp(`exceeds its ${MAXIMUM_DISCOVERY_PAYLOAD_CHARACTERS}-character payload limit`)
  );
});

test('reads bounded, shareable filter state and ignores malformed slug values', () => {
  const filters = readNewsFilters(new URLSearchParams(
    'q=%20SETTINGS%20&project=playergamedata&category=release&tag=settings'
  ));

  assert.deepEqual(filters, {
    category: 'release',
    project: 'playergamedata',
    q: 'SETTINGS',
    tag: 'settings'
  });
  assert.deepEqual(
    readNewsFilters(new URLSearchParams('project=../../editorial&tag=not%20a%20slug')),
    {}
  );
  assert.equal(readNewsFilters(new URLSearchParams(`q=${'a'.repeat(121)}`)).q.length, 120);
});

test('filters public snapshot text and metadata with intersection semantics', () => {
  assert.deepEqual(
    filterPublicNews(posts, { q: 'SETTINGS', project: 'playergamedata', tag: 'settings' })
      .map((post) => post.id),
    ['aaaaaaaaaaaaaaaaaaaaaaaa']
  );
  assert.deepEqual(
    filterPublicNews(posts, { q: 'weekend', category: 'release' }),
    []
  );
  assert.deepEqual(
    filterPublicNews(posts, { q: 'friendlier' }),
    []
  );
  assert.deepEqual(
    filterPublicNews(posts, { q: '[settings]' }).map((post) => post.id),
    []
  );
});

test('derives deterministic control options and canonical URL order', () => {
  assert.deepEqual(getNewsFilterOptions(posts), {
    categories: ['community', 'release'],
    projects: ['multiplayersessionbroker', 'playergamedata'],
    tags: ['announcement', 'community', 'settings']
  });
  assert.equal(
    serialiseNewsFilters({ tag: 'settings', q: 'players', category: 'release', project: 'playergamedata' }).toString(),
    'q=players&project=playergamedata&category=release&tag=settings'
  );
});

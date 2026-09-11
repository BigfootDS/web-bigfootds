import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterPublicNews,
  getNewsFilterOptions,
  readNewsFilters,
  serialiseNewsFilters
} from '../src/lib/news-discovery.mjs';

const posts = [
  {
    category: 'release',
    content: {
      body: 'The game client now has a much friendlier settings screen.',
      summary: 'A settings update for players.',
      title: 'Player settings release'
    },
    id: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    projectId: 'playergamedata',
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
    tags: ['community']
  }
];

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

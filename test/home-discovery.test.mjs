import assert from 'node:assert/strict';
import test from 'node:test';

import { selectFeaturedProjects, selectLatestNews } from '../src/lib/home-discovery.mjs';

test('keeps the latest News selection bounded and leaves an empty snapshot empty', () => {
  assert.deepEqual(selectLatestNews([]), []);
  assert.deepEqual(selectLatestNews(['newest', 'middle', 'oldest'], 2), ['newest', 'middle']);
  assert.throws(() => selectLatestNews(['one'], 0), /whole number/);
});

test('features only published project directory entries in newest-first order', () => {
  const projects = [
    { availability: 'coming-soon', id: 'bees', title: 'The Bestest Beehive' },
    { availability: 'available', id: 'older', publishedAt: '2023-01-01T00:00:00.000Z', title: 'Older project' },
    { availability: 'available', id: 'newer', publishedAt: '2024-01-01T00:00:00.000Z', title: 'Newer project' }
  ];

  assert.deepEqual(
    selectFeaturedProjects(projects).map((project) => project.id),
    ['newer', 'older']
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { selectFeaturedProjects, selectLatestNews } from '../src/lib/home-discovery.mjs';

test('keeps the latest News selection bounded and leaves an empty snapshot empty', () => {
  assert.deepEqual(selectLatestNews([]), []);
  assert.deepEqual(selectLatestNews(['newest', 'middle', 'oldest'], 2), ['newest', 'middle']);
  assert.throws(() => selectLatestNews(['one'], 0), /whole number/);
});

test('features only explicit editorial selections in their declared order', () => {
  const projects = [
    { featuredOrder: 2, id: 'godmaker', title: 'Godmaker' },
    { id: 'unrelated', title: 'Unrelated project' },
    { featuredOrder: 3, id: 'game-automated-semver', title: 'Game Automated Semver' },
    { featuredOrder: 1, id: 'planet-protector-vr', title: 'Planet Protector VR' }
  ];

  assert.deepEqual(
    selectFeaturedProjects(projects).map((project) => project.id),
    ['planet-protector-vr', 'godmaker', 'game-automated-semver']
  );
  assert.deepEqual(selectFeaturedProjects(projects, 2).map((project) => project.id), ['planet-protector-vr', 'godmaker']);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProjectDiscoveryIndex,
  filterProjects,
  readProjectFilters,
  serialiseProjectFilters
} from '../src/lib/project-discovery.mjs';

const projects = createProjectDiscoveryIndex([
  {
    description: 'A published Unity package.',
    featuredOrder: 2,
    id: 'unity-semver-updater',
    publishedAt: new Date('2024-07-10T00:00:00.000Z'),
    title: 'Unity Semver Updater'
  },
  {
    description: 'A future project about bees.',
    id: 'the-bestest-beehive',
    title: 'The Bestest Beehive'
  },
  {
    description: 'An earlier published game.',
    id: 'planet-protector-vr',
    publishedAt: new Date('2023-05-10T00:00:00.000Z'),
    title: 'Planet Protector VR'
  }
]);

test('creates an honest directory that derives availability only from publication dates', () => {
  assert.deepEqual(projects[0], {
    availability: 'available',
    description: 'A published Unity package.',
    featuredOrder: 2,
    href: '/projects/unity-semver-updater/',
    id: 'unity-semver-updater',
    publishedAt: '2024-07-10T00:00:00.000Z',
    title: 'Unity Semver Updater'
  });
  assert.equal(projects[1].availability, 'coming-soon');
  assert.equal('publishedAt' in projects[1], false);
  assert.throws(
    () => createProjectDiscoveryIndex([{
      description: 'Invalid featured selection.',
      featuredOrder: 0,
      id: 'invalid-featured-selection',
      title: 'Invalid featured selection'
    }]),
    /invalid featuredOrder/
  );
  assert.throws(
    () => createProjectDiscoveryIndex([
      {
        description: 'First selected project.',
        featuredOrder: 1,
        id: 'first-featured-project',
        title: 'First selected project'
      },
      {
        description: 'Second selected project.',
        featuredOrder: 1,
        id: 'second-featured-project',
        title: 'Second selected project'
      }
    ]),
    /duplicate featuredOrder/
  );
});

test('reads bounded URL state and ignores unsupported lifecycle and sort values', () => {
  assert.deepEqual(
    readProjectFilters(new URLSearchParams('q=%20BEES%20&availability=coming-soon&sort=title')),
    { availability: 'coming-soon', q: 'BEES', sort: 'title' }
  );
  assert.deepEqual(readProjectFilters(new URLSearchParams('availability=beta&sort=popular')), {});
  assert.equal(readProjectFilters(new URLSearchParams(`q=${'a'.repeat(121)}`)).q.length, 120);
});

test('filters literal project text and applies lifecycle intersection semantics', () => {
  assert.deepEqual(
    filterProjects(projects, { availability: 'coming-soon', q: 'BEES' }).map((project) => project.id),
    ['the-bestest-beehive']
  );
  assert.deepEqual(filterProjects(projects, { availability: 'available', q: 'bees' }), []);
  assert.deepEqual(filterProjects(projects, { q: '[bees]' }), []);
});

test('sorts deterministically and serialises shareable non-default state', () => {
  assert.deepEqual(
    filterProjects(projects, {}).map((project) => project.id),
    ['unity-semver-updater', 'planet-protector-vr', 'the-bestest-beehive']
  );
  assert.deepEqual(
    filterProjects(projects, { sort: 'oldest' }).map((project) => project.id),
    ['planet-protector-vr', 'unity-semver-updater', 'the-bestest-beehive']
  );
  assert.deepEqual(
    filterProjects(projects, { sort: 'title' }).map((project) => project.id),
    ['planet-protector-vr', 'the-bestest-beehive', 'unity-semver-updater']
  );
  assert.equal(
    serialiseProjectFilters({ availability: 'available', q: 'unity', sort: 'title' }).toString(),
    'q=unity&availability=available&sort=title'
  );
  assert.equal(serialiseProjectFilters({ sort: 'newest' }).toString(), '');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { PRIMARY_NAVIGATION_LINKS } from '../src/lib/primary-navigation.mjs';

test('keeps the primary navigation focused on the approved core journeys', () => {
  assert.deepEqual(PRIMARY_NAVIGATION_LINKS, [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/news', label: 'News' },
    { href: '/projects', label: 'Projects' },
    { href: '/account', label: 'Accounts' }
  ]);
});

test('does not present public profile, event or staff routes as primary journeys', () => {
  const primaryHrefs = PRIMARY_NAVIGATION_LINKS.map(({ href }) => href);

  assert.equal(primaryHrefs.includes('/events'), false);
  assert.equal(primaryHrefs.includes('/profiles'), false);
  assert.equal(primaryHrefs.some((href) => href.startsWith('/admin')), false);
});

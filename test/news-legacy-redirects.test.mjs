import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicNewsFeedItems, getPublishedLegacyNewsRedirects } from '../src/lib/news-legacy-redirects.mjs';

const posts = [
  { id: '6abc9266f576bac82f5f8fe3', publishAt: '2024-12-29T12:00:00.000Z', content: { title: 'Website Overhaul', summary: 'A & B' } },
  { id: '6abc934df576bac82f5f8fe5', publishAt: '2024-12-31T12:00:00.000Z', content: { title: '2024 Year In Review', summary: 'Review' } },
  { id: '6abc93e9f576bac82f5f8fe6', publishAt: '2025-12-31T12:00:00.000Z', content: { title: '2025 Year In Review', summary: 'Review' } }
];

test('maps every migrated legacy URL to its current canonical public article', () => {
  assert.deepEqual(getPublishedLegacyNewsRedirects(posts), [
    { slug: '2024-12-29-website-overhaul', target: '/news/6abc9266f576bac82f5f8fe3/' },
    { slug: '2024-12-31-2024-year-in-review', target: '/news/6abc934df576bac82f5f8fe5/' },
    { slug: '2025-12-31-2025-year-in-review', target: '/news/6abc93e9f576bac82f5f8fe6/' }
  ]);
});

test('unpublishing a target removes its legacy redirect without retaining old article data', () => {
  assert.deepEqual(getPublishedLegacyNewsRedirects([]), []);
  assert.deepEqual(getPublishedLegacyNewsRedirects([posts[2], { id: 'ffffffffffffffffffffffff' }]), [
    { slug: '2025-12-31-2025-year-in-review', target: '/news/6abc93e9f576bac82f5f8fe6/' }
  ]);
});

test('RSS uses canonical News URLs, summaries and preserved publication dates', () => {
  const items = createPublicNewsFeedItems(posts);
  assert.deepEqual(items[0], { title: 'Website Overhaul', description: 'A & B',
    pubDate: new Date('2024-12-29T12:00:00.000Z'), link: '/news/6abc9266f576bac82f5f8fe3/' });
  assert.equal(items.length, 3);
  assert.deepEqual(createPublicNewsFeedItems([]), []);
});

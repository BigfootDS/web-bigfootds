const legacyArticles = Object.freeze([
  { slug: '2024-12-29-website-overhaul', id: '6abc9266f576bac82f5f8fe3' },
  { slug: '2024-12-31-2024-year-in-review', id: '6abc934df576bac82f5f8fe5' },
  { slug: '2025-12-31-2025-year-in-review', id: '6abc93e9f576bac82f5f8fe6' }
]);

/**
 * Returns legacy redirects only while their target is in the validated public
 * snapshot. Unpublishing a migrated post removes both URLs on the next build,
 * rather than preserving an old body or emitting a redirect to a missing page.
 * @param {readonly { id: string }[]} posts Current public MS-News posts.
 * @returns {{ slug: string, target: string }[]} Fixed same-site redirect paths.
 */
export function getPublishedLegacyNewsRedirects(posts) {
  const publicIds = new Set(posts.map((post) => post.id));
  return legacyArticles.filter(({ id }) => publicIds.has(id))
    .map(({ slug, id }) => ({ slug, target: `/news/${id}/` }));
}

/**
 * Uses the same canonical records as public News pages for RSS. Feed items
 * contain presentation fields only; the RSS library escapes their XML values.
 * @param {readonly import('../../scripts/news-publication.mjs').PublicNewsPost[]} posts Validated public records.
 * @returns {{ title: string, description: string, pubDate: Date, link: string }[]} Canonical feed entries.
 */
export function createPublicNewsFeedItems(posts) {
  return posts.map((post) => ({ title: post.content.title, description: post.content.summary,
    pubDate: new Date(post.publishAt), link: `/news/${post.id}/` }));
}

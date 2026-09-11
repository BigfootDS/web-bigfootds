import { fileURLToPath } from 'node:url';

import { readPublicNewsSnapshot } from '../../scripts/news-publication.mjs';

const snapshotPath = fileURLToPath(new URL('../generated/public-news.json', import.meta.url));

/**
 * Loads the build-time MS-News snapshot for Astro routes. This module only runs
 * on the build server, so it deliberately has no browser-facing API base URL,
 * credentials, or network request.
 *
 * @returns {Promise<readonly import('../../scripts/news-publication.mjs').PublicNewsPost[]>} Public posts sorted by publication time.
 */
export async function getGeneratedPublicNews() {
  const snapshot = await readPublicNewsSnapshot(snapshotPath);
  return snapshot.posts;
}

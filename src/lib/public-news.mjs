import { resolve } from 'node:path';

import { readPublicNewsSnapshot } from '../../scripts/news-publication.mjs';

const snapshotPath = resolve(process.cwd(), 'src/generated/public-news.json');

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

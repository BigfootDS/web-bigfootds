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
  return (await getGeneratedPublicNewsSnapshot()).posts;
}

/**
 * Loads the complete build-time MS-News snapshot for routes that need the
 * verified public media-route prefix as well as article metadata.
 *
 * This still performs no browser request and never exposes editorial
 * credentials: the route prefix is an ordinary public MS-News endpoint that
 * authorises each media redirect at request time.
 *
 * @returns {ReturnType<typeof readPublicNewsSnapshot>} Validated static public News snapshot.
 */
export function getGeneratedPublicNewsSnapshot() {
  return readPublicNewsSnapshot(snapshotPath);
}

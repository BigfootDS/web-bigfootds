import { filterProjects } from './project-discovery.mjs';

/**
 * Selects the most recent public News items for the static home page.
 *
 * The MS-News snapshot is already validated and newest-first when Astro loads
 * it. Returning an empty list is intentional: Home must omit the section when
 * a deployment has no published News rather than displaying placeholder copy.
 *
 * @template T
 * @param {readonly T[]} posts - Newest-first public News snapshot.
 * @param {number} [maximum=3] - Small visual-card limit for Home.
 * @returns {readonly T[]} Bounded newest-first selection.
 */
export function selectLatestNews(posts, maximum = 3) {
  return posts.slice(0, readMaximum(maximum));
}

/**
 * Selects published projects without assigning status data the content lacks.
 *
 * The directory's existing `available` value is derived only from a project
 * publication date. This gives Home useful current work to feature while
 * leaving undated work discoverable through the full Projects page.
 *
 * @template T extends {{ availability: string }}
 * @param {readonly T[]} projects - Project directory metadata.
 * @param {number} [maximum=3] - Small visual-card limit for Home.
 * @returns {readonly T[]} Newest-first published project selection.
 */
export function selectFeaturedProjects(projects, maximum = 3) {
  return filterProjects(projects, { availability: 'available' }).slice(0, readMaximum(maximum));
}

function readMaximum(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 12) {
    throw new RangeError('Home discovery maximum must be a whole number from 1 through 12.');
  }
  return value;
}

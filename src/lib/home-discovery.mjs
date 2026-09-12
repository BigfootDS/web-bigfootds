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
 * Selects editorially promoted projects for the static home page.
 *
 * An explicit content order deliberately avoids treating publication date or
 * release status as a proxy for what BigfootDS wants to promote. This allows
 * an in-development project to sit alongside released work without making a
 * false availability claim in the full project directory.
 *
 * @template T extends {{ featuredOrder?: number }}
 * @param {readonly T[]} projects - Project directory metadata.
 * @param {number} [maximum=3] - Small visual-card limit for Home.
 * @returns {readonly T[]} Explicitly ordered featured-project selection.
 */
export function selectFeaturedProjects(projects, maximum = 3) {
  return projects
    .filter((project) => Number.isSafeInteger(project.featuredOrder))
    .toSorted((left, right) => left.featuredOrder - right.featuredOrder)
    .slice(0, readMaximum(maximum));
}

function readMaximum(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 12) {
    throw new RangeError('Home discovery maximum must be a whole number from 1 through 12.');
  }
  return value;
}

const maximumProjectCount = 500;
const maximumProjectDescriptionLength = 2_000;
const maximumProjectIdLength = 160;
const maximumProjectTitleLength = 300;
const maximumQueryLength = 120;
const projectAvailabilityValues = new Set(['available', 'coming-soon']);
const projectSortValues = new Set(['newest', 'oldest', 'title']);

/**
 * Creates the bounded static directory sent to a visitor's browser.
 *
 * Project pages remain the canonical source. The directory uses the optional
 * publication date only to preserve the existing site's “Available now” and
 * “Coming soon” grouping; it does not claim richer lifecycle metadata.
 *
 * @param {readonly ProjectSource[]} projects - Project content collected by Astro at build time.
 * @returns {readonly PublicProject[]} Safe, searchable project metadata.
 * @throws {Error} When project content exceeds the directory's bounded contract.
 */
export function createProjectDiscoveryIndex(projects) {
  if (projects.length > maximumProjectCount) {
    throw new Error(`Project discovery supports at most ${maximumProjectCount} projects; received ${projects.length}.`);
  }

  const featuredOrders = new Set();
  return projects.map((project, index) => {
    const id = readBoundedText(project.id, 'id', maximumProjectIdLength, index);
    const title = readBoundedText(project.title, 'title', maximumProjectTitleLength, index);
    const description = readBoundedText(project.description, 'description', maximumProjectDescriptionLength, index);
    const publishedAt = readPublishedAt(project.publishedAt, index);
    const featuredOrder = readFeaturedOrder(project.featuredOrder, index);

    if (featuredOrder !== undefined && featuredOrders.has(featuredOrder)) {
      throw new Error(`Project discovery has duplicate featuredOrder ${featuredOrder}.`);
    }
    if (featuredOrder !== undefined) featuredOrders.add(featuredOrder);

    return {
      availability: publishedAt === undefined ? 'coming-soon' : 'available',
      description,
      ...(featuredOrder === undefined ? {} : { featuredOrder }),
      href: `/projects/${id}/`,
      id,
      ...(publishedAt === undefined ? {} : { publishedAt }),
      title
    };
  });
}

/**
 * Reads the small, shareable project-directory state from a URL.
 *
 * Unknown lifecycle and sort values deliberately fall back to the default
 * rather than becoming a browser-side query language.
 *
 * @param {URLSearchParams} searchParams - Project-directory URL state.
 * @returns {{ availability?: 'available' | 'coming-soon', q?: string, sort?: 'newest' | 'oldest' | 'title' }} Normalised filters.
 */
export function readProjectFilters(searchParams) {
  const availability = normaliseAvailability(searchParams.get('availability'));
  const q = normaliseQuery(searchParams.get('q'));
  const sort = normaliseSort(searchParams.get('sort'));

  return {
    ...(availability === undefined ? {} : { availability }),
    ...(q === undefined ? {} : { q }),
    ...(sort === undefined ? {} : { sort })
  };
}

/**
 * Builds canonical URL state for the static directory.
 *
 * The default newest-first sort is omitted, keeping copied links concise while
 * retaining explicit title or oldest-first choices.
 *
 * @param {{ availability?: string, q?: string, sort?: string }} filters - Candidate project-directory state.
 * @returns {URLSearchParams} Canonical parameters in stable key order.
 */
export function serialiseProjectFilters(filters) {
  const parameters = new URLSearchParams();
  const q = normaliseQuery(filters.q ?? null);
  const availability = normaliseAvailability(filters.availability ?? null);
  const sort = normaliseSort(filters.sort ?? null);

  if (q !== undefined) parameters.set('q', q);
  if (availability !== undefined) parameters.set('availability', availability);
  if (sort !== undefined && sort !== 'newest') parameters.set('sort', sort);

  return parameters;
}

/**
 * Filters metadata already embedded in the static page, then applies a stable
 * controlled sort. Searches are literal, case-insensitive title/description
 * matching; no query is sent to a service and user text is never interpreted
 * as a regular expression.
 *
 * @param {readonly PublicProject[]} projects - Build-time project directory.
 * @param {{ availability?: string, q?: string, sort?: string }} filters - URL-derived filters.
 * @returns {readonly PublicProject[]} Matching projects in requested order.
 */
export function filterProjects(projects, filters) {
  const availability = normaliseAvailability(filters.availability ?? null);
  const query = normaliseSearchText(normaliseQuery(filters.q ?? null) ?? '');
  const sort = normaliseSort(filters.sort ?? null) ?? 'newest';

  return projects
    .filter((project) => {
      if (availability !== undefined && project.availability !== availability) return false;
      if (query === '') return true;
      return normaliseSearchText(`${project.title}\n${project.description}`).includes(query);
    })
    .toSorted((left, right) => compareProjects(left, right, sort));
}

/** @typedef {{ description: string, featuredOrder?: number, id: string, publishedAt?: Date, title: string }} ProjectSource */
/** @typedef {{ availability: 'available' | 'coming-soon', description: string, featuredOrder?: number, href: string, id: string, publishedAt?: string, title: string }} PublicProject */

function compareProjects(left, right, sort) {
  if (sort === 'title') return compareText(left.title, right.title, left.id, right.id);

  const leftTime = left.publishedAt === undefined ? undefined : Date.parse(left.publishedAt);
  const rightTime = right.publishedAt === undefined ? undefined : Date.parse(right.publishedAt);

  if (leftTime === undefined && rightTime === undefined) return compareText(left.title, right.title, left.id, right.id);
  if (leftTime === undefined) return 1;
  if (rightTime === undefined) return -1;
  if (leftTime !== rightTime) return sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;

  return compareText(left.title, right.title, left.id, right.id);
}

function compareText(left, right, leftId, rightId) {
  return left.localeCompare(right, 'en-AU') || leftId.localeCompare(rightId, 'en-AU');
}

function readBoundedText(value, field, maximumLength, index) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximumLength) {
    throw new Error(`Project discovery item ${index + 1} has an invalid ${field}; maximum length is ${maximumLength}.`);
  }

  return value;
}

function readPublishedAt(value, index) {
  if (value === undefined) return undefined;
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new Error(`Project discovery item ${index + 1} has an invalid publishedAt date.`);
  }

  return value.toISOString();
}

function readFeaturedOrder(value, index) {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || value < 1 || value > 12) {
    throw new Error(`Project discovery item ${index + 1} has an invalid featuredOrder.`);
  }
  return value;
}

function normaliseAvailability(value) {
  if (typeof value !== 'string') return undefined;
  const normalised = value.normalize('NFKC').trim().toLowerCase();
  return projectAvailabilityValues.has(normalised) ? normalised : undefined;
}

function normaliseQuery(value) {
  if (typeof value !== 'string') return undefined;
  const normalised = value.normalize('NFKC').trim().slice(0, maximumQueryLength);
  return normalised === '' ? undefined : normalised;
}

function normaliseSearchText(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en-AU');
}

function normaliseSort(value) {
  if (typeof value !== 'string') return undefined;
  const normalised = value.normalize('NFKC').trim().toLowerCase();
  return projectSortValues.has(normalised) ? normalised : undefined;
}

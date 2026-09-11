export const MAXIMUM_DISCOVERY_ITEM_COUNT = 2_000;
export const MAXIMUM_DISCOVERY_PAYLOAD_CHARACTERS = 4_000_000;
export const MAXIMUM_DISCOVERY_SUMMARY_LENGTH = 2_000;
export const MAXIMUM_DISCOVERY_TITLE_LENGTH = 300;
const maximumDiscoveryCategoryLength = 100;
const maximumDiscoveryIdLength = 24;
const maximumDiscoveryProjectLength = 100;
const maximumDiscoveryPublishAtLength = 30;
const maximumDiscoveryTagCount = 50;
const maximumDiscoveryTagLength = 100;
const maximumQueryLength = 120;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Selects the small public index sent to a visitor's browser. Full article
 * bodies remain available only to the server while it generates individual
 * static article pages, preventing the discovery page from duplicating every
 * published body in one response.
 *
 * The item, field, and total payload limits fail the build with a useful error
 * before a growing archive can make the static discovery page impractical.
 *
 * @param {readonly PublicNewsSourcePost[]} posts - Validated generator snapshot.
 * @returns {readonly PublicNewsDiscoveryPost[]} Bounded metadata for browser filtering.
 * @throws {Error} When the snapshot exceeds discovery-page safety limits.
 */
export function createNewsDiscoveryIndex(posts) {
  if (posts.length > MAXIMUM_DISCOVERY_ITEM_COUNT) {
    throw new Error(
      `Public news discovery supports at most ${MAXIMUM_DISCOVERY_ITEM_COUNT} posts; received ${posts.length}. `
      + 'Add an approved archive or pagination design before publishing more.'
    );
  }

  const index = posts.map((post, indexPosition) => ({
    category: readBoundedText(post.category, 'category', maximumDiscoveryCategoryLength, indexPosition),
    id: readBoundedText(post.id, 'id', maximumDiscoveryIdLength, indexPosition),
    projectId: readBoundedText(post.projectId, 'projectId', maximumDiscoveryProjectLength, indexPosition),
    publishAt: readBoundedText(post.publishAt, 'publishAt', maximumDiscoveryPublishAtLength, indexPosition),
    summary: readBoundedText(post.content.summary, 'summary', MAXIMUM_DISCOVERY_SUMMARY_LENGTH, indexPosition),
    tags: readBoundedTags(post.tags, indexPosition),
    title: readBoundedText(post.content.title, 'title', MAXIMUM_DISCOVERY_TITLE_LENGTH, indexPosition)
  }));
  const payloadCharacters = JSON.stringify(index).length;

  if (payloadCharacters > MAXIMUM_DISCOVERY_PAYLOAD_CHARACTERS) {
    throw new Error(
      `Public news discovery exceeds its ${MAXIMUM_DISCOVERY_PAYLOAD_CHARACTERS}-character payload limit. `
      + 'Add an approved archive or pagination design before publishing more.'
    );
  }

  return index;
}

/**
 * Extracts the safe, shareable news-filter state from a URL. Unknown or
 * malformed filter values are ignored instead of becoming a client-side query
 * language, while a query remains a bounded literal text match.
 *
 * @param {URLSearchParams} searchParams - URL state from the static news page.
 * @returns {{ category?: string, project?: string, q?: string, tag?: string }} Normalised filter state.
 */
export function readNewsFilters(searchParams) {
  const q = normaliseQuery(searchParams.get('q'));
  const project = normaliseSlug(searchParams.get('project'));
  const category = normaliseSlug(searchParams.get('category'));
  const tag = normaliseSlug(searchParams.get('tag'));

  return {
    ...(q === undefined ? {} : { q }),
    ...(project === undefined ? {} : { project }),
    ...(category === undefined ? {} : { category }),
    ...(tag === undefined ? {} : { tag })
  };
}

/**
 * Builds canonical URL state in a stable key order, keeping copied and shared
 * discovery links small and avoiding browser-only state that cannot be shared.
 *
 * @param {{ category?: string, project?: string, q?: string, tag?: string }} filters - Filter state to serialise.
 * @returns {URLSearchParams} Query parameters suitable for the public news URL.
 */
export function serialiseNewsFilters(filters) {
  const parameters = new URLSearchParams();
  const q = normaliseQuery(filters.q ?? null);
  const project = normaliseSlug(filters.project ?? null);
  const category = normaliseSlug(filters.category ?? null);
  const tag = normaliseSlug(filters.tag ?? null);

  if (q !== undefined) parameters.set('q', q);
  if (project !== undefined) parameters.set('project', project);
  if (category !== undefined) parameters.set('category', category);
  if (tag !== undefined) parameters.set('tag', tag);

  return parameters;
}

/**
 * Applies literal, case-insensitive matching to data already published in the
 * build snapshot. This performs no network request and deliberately does not
 * interpret a visitor's query as a regular expression.
 *
 * @param {readonly PublicNewsDiscoveryPost[]} posts - Build-time public posts.
 * @param {{ category?: string, project?: string, q?: string, tag?: string }} filters - URL-derived filter state.
 * @returns {readonly PublicNewsDiscoveryPost[]} Matching posts in source order.
 */
export function filterPublicNews(posts, filters) {
  const normalisedQuery = normaliseSearchText(filters.q ?? '');
  const project = normaliseSlug(filters.project ?? null);
  const category = normaliseSlug(filters.category ?? null);
  const tag = normaliseSlug(filters.tag ?? null);

  return posts.filter((post) => {
    if (project !== undefined && post.projectId !== project) return false;
    if (category !== undefined && post.category !== category) return false;
    if (tag !== undefined && !post.tags.includes(tag)) return false;

    if (normalisedQuery === '') return true;

    const searchableText = normaliseSearchText([
      post.title,
      post.summary
    ].join('\n'));

    return searchableText.includes(normalisedQuery);
  });
}

/**
 * Lists the controlled filter choices from the static snapshot. Keeping these
 * values data-derived stops URL filters from implying unpublished categories,
 * projects, or tags that are not in the current public build.
 *
 * @param {readonly PublicNewsDiscoveryPost[]} posts - Build-time public posts.
 * @returns {{ categories: readonly string[], projects: readonly string[], tags: readonly string[] }} Sorted option values.
 */
export function getNewsFilterOptions(posts) {
  return {
    categories: uniqueSorted(posts.map((post) => post.category)),
    projects: uniqueSorted(posts.map((post) => post.projectId)),
    tags: uniqueSorted(posts.flatMap((post) => post.tags))
  };
}

/** @typedef {{ category: string, content: { body: string, summary: string, title: string }, id: string, projectId: string, publishAt: string, tags: readonly string[] }} PublicNewsSourcePost */
/** @typedef {{ category: string, id: string, projectId: string, publishAt: string, summary: string, tags: readonly string[], title: string }} PublicNewsDiscoveryPost */

function readBoundedText(value, field, maximumLength, indexPosition) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumLength) {
    throw new Error(
      `Public news discovery item ${indexPosition + 1} has an invalid ${field}; maximum length is ${maximumLength}.`
    );
  }

  return value;
}

function readBoundedTags(value, indexPosition) {
  if (!Array.isArray(value) || value.length > maximumDiscoveryTagCount) {
    throw new Error(
      `Public news discovery item ${indexPosition + 1} has too many tags; maximum count is ${maximumDiscoveryTagCount}.`
    );
  }

  return value.map((tag) => readBoundedText(tag, 'tag', maximumDiscoveryTagLength, indexPosition));
}

function normaliseQuery(value) {
  if (typeof value !== 'string') return undefined;

  const normalised = value.normalize('NFKC').trim().slice(0, maximumQueryLength);
  return normalised === '' ? undefined : normalised;
}

function normaliseSlug(value) {
  if (typeof value !== 'string') return undefined;

  const normalised = value.normalize('NFKC').trim().toLowerCase();
  return slugPattern.test(normalised) ? normalised : undefined;
}

function normaliseSearchText(value) {
  return value.normalize('NFKC').toLocaleLowerCase('en-AU');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en-AU'));
}

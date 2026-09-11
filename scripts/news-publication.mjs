import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_NEWS_LOCALE = 'en-AU';
export const NEWS_API_BASE_URL_ENVIRONMENT_VARIABLE = 'MS_NEWS_PUBLIC_API_BASE_URL';
const NEWS_LIST_PATH = '/api/v1/news';
const MAXIMUM_PAGE_COUNT = 1_000;
const MAXIMUM_PAGE_SIZE = 50;
const objectIdPattern = /^[a-f0-9]{24}$/i;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Returns the configured public MS-News origin, rejecting values that could
 * accidentally turn a build into a request to an editorial or credential URL.
 *
 * @param {string | undefined} configuredValue - Non-secret build environment value.
 * @returns {string} Canonical origin without a trailing slash.
 * @throws {Error} When the website API origin is missing or not a bare HTTP(S) origin.
 */
export function readNewsApiBaseUrl(configuredValue) {
  if (typeof configuredValue !== 'string' || configuredValue.trim() === '') {
    throw new Error(
      `${NEWS_API_BASE_URL_ENVIRONMENT_VARIABLE} is required to build public news. `
      + 'Set it to the public MS-News HTTP(S) origin, then run npm run news:sync.'
    );
  }

  let url;

  try {
    url = new URL(configuredValue.trim());
  } catch {
    throw new Error(`${NEWS_API_BASE_URL_ENVIRONMENT_VARIABLE} must be a valid HTTP(S) origin.`);
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:')
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new Error(
      `${NEWS_API_BASE_URL_ENVIRONMENT_VARIABLE} must be a bare public HTTP(S) origin without credentials, a path, query, or fragment.`
    );
  }

  return url.origin;
}

/**
 * Downloads every public page for one locale and normalises the untrusted JSON
 * into the small, text-only shape the static site is allowed to publish.
 *
 * Pagination is sequential because MS-News cursors are opaque. Repeated
 * cursors, duplicate IDs, and malformed pages fail the build instead of
 * producing a partial or non-deterministic website snapshot.
 *
 * @param {{ apiBaseUrl: string, fetchImpl?: typeof fetch, locale?: string }} options - Public source settings.
 * @returns {Promise<{ locale: string, posts: readonly PublicNewsPost[], version: 1 }>} Deterministically sorted public data.
 */
export async function fetchPublicNews(options) {
  const apiBaseUrl = readNewsApiBaseUrl(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const locale = options.locale ?? DEFAULT_NEWS_LOCALE;
  const posts = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor;

  for (let pageNumber = 1; pageNumber <= MAXIMUM_PAGE_COUNT; pageNumber += 1) {
    const url = new URL(NEWS_LIST_PATH, apiBaseUrl);
    url.searchParams.set('locale', locale);
    url.searchParams.set('limit', String(MAXIMUM_PAGE_SIZE));

    if (cursor !== undefined) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetchImpl(url);

    if (!response.ok) {
      throw new Error(`MS-News public list request failed with HTTP ${response.status}.`);
    }

    const page = normalisePublicNewsPage(await response.json(), locale);

    for (const post of page.results) {
      if (seenIds.has(post.id)) {
        throw new Error(`MS-News returned duplicate public news ID ${post.id}.`);
      }

      seenIds.add(post.id);
      posts.push(post);
    }

    if (page.nextCursor === undefined) {
      return {
        locale,
        posts: posts.sort(comparePublicNewsPosts),
        version: 1
      };
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error('MS-News returned a repeated public news cursor.');
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error(`MS-News returned more than ${MAXIMUM_PAGE_COUNT} public news pages.`);
}

/**
 * Writes the generated, non-canonical snapshot atomically. Replacing rather
 * than merging the file removes posts that have since been unpublished or
 * expired from the next static build.
 *
 * @param {string} outputPath - Ignored JSON file read by Astro during the build.
 * @param {{ locale: string, posts: readonly PublicNewsPost[], version: 1 }} snapshot - Validated public source data.
 * @returns {Promise<void>}
 */
export async function writePublicNewsSnapshot(outputPath, snapshot) {
  const serialisedSnapshot = `${JSON.stringify(snapshot, null, 2)}\n`;
  const temporaryPath = `${outputPath}.tmp`;

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, serialisedSnapshot, 'utf8');
  await rename(temporaryPath, outputPath);
}

/**
 * Reads the static snapshot after the sync command has run. A missing file is
 * an actionable build configuration failure, rather than an empty news page
 * that could be mistaken for a successful publication run.
 *
 * @param {string} filePath - Ignored snapshot path.
 * @returns {Promise<{ locale: string, posts: readonly PublicNewsPost[], version: 1 }>}
 */
export async function readPublicNewsSnapshot(filePath) {
  let content;

  try {
    const { readFile } = await import('node:fs/promises');
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error('Generated public news is missing. Run npm run news:sync before Astro builds the website.');
    }

    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Generated public news is not valid JSON. Run npm run news:sync again.');
  }

  if (!isRecord(parsed) || parsed.version !== 1 || typeof parsed.locale !== 'string' || !Array.isArray(parsed.posts)) {
    throw new Error('Generated public news has an unsupported shape. Run npm run news:sync again.');
  }

  const posts = parsed.posts.map((post) => normalisePublicNewsPost(post, parsed.locale));
  const sortedPosts = [...posts].sort(comparePublicNewsPosts);

  if (posts.some((post, index) => post !== sortedPosts[index])) {
    throw new Error('Generated public news is not sorted deterministically. Run npm run news:sync again.');
  }

  return { locale: parsed.locale, posts, version: 1 };
}

/** @typedef {{ category: string, content: { body: string, locale: string, summary: string, title: string }, id: string, projectId: string, publishAt: string, tags: readonly string[] }} PublicNewsPost */

function normalisePublicNewsPage(value, locale) {
  if (!isRecord(value) || !Array.isArray(value.results) || !isRecord(value.pagination)) {
    throw new Error('MS-News returned a malformed public news page.');
  }

  const nextCursor = value.pagination.nextCursor;

  if (nextCursor !== undefined && (typeof nextCursor !== 'string' || nextCursor.length === 0 || nextCursor.length > 1_024)) {
    throw new Error('MS-News returned an invalid public news cursor.');
  }

  return {
    nextCursor,
    results: value.results.map((post) => normalisePublicNewsPost(post, locale))
  };
}

function normalisePublicNewsPost(value, requestedLocale) {
  if (!isRecord(value) || !isRecord(value.content)) {
    throw new Error('MS-News returned a malformed public news post.');
  }

  const id = normaliseObjectId(value.id, 'id');
  const projectId = normaliseSlug(value.projectId, 'projectId');
  const category = normaliseSlug(value.category, 'category');
  const publishAt = normaliseIsoDate(value.publishAt, 'publishAt');
  const content = {
    body: normaliseText(value.content.body, 'content.body', 100_000),
    locale: normaliseText(value.content.locale, 'content.locale', 35),
    summary: normaliseText(value.content.summary, 'content.summary', 2_000),
    title: normaliseText(value.content.title, 'content.title', 300)
  };

  if (content.locale !== requestedLocale) {
    throw new Error(`MS-News returned ${content.locale} content while ${requestedLocale} was requested.`);
  }

  if (!Array.isArray(value.tags) || value.tags.length > 50) {
    throw new Error('MS-News returned invalid public news tags.');
  }

  const tags = [...new Set(value.tags.map((tag) => normaliseSlug(tag, 'tags')))].sort();

  if (tags.length !== value.tags.length) {
    throw new Error('MS-News returned duplicate public news tags.');
  }

  return { category, content, id, projectId, publishAt, tags };
}

function normaliseText(value, field, maximumLength) {
  if (typeof value !== 'string') {
    throw new Error(`MS-News returned a non-text ${field} value.`);
  }

  const normalised = value.normalize('NFC').trim();

  if (normalised.length === 0 || normalised.length > maximumLength) {
    throw new Error(`MS-News returned an invalid ${field} value.`);
  }

  return normalised;
}

function normaliseObjectId(value, field) {
  const normalised = normaliseText(value, field, 24).toLowerCase();

  if (!objectIdPattern.test(normalised)) {
    throw new Error(`MS-News returned an invalid ${field} value.`);
  }

  return normalised;
}

function normaliseSlug(value, field) {
  const normalised = normaliseText(value, field, 100).toLowerCase();

  if (!slugPattern.test(normalised)) {
    throw new Error(`MS-News returned an invalid ${field} value.`);
  }

  return normalised;
}

function normaliseIsoDate(value, field) {
  const normalised = normaliseText(value, field, 30);
  const date = new Date(normalised);

  if (Number.isNaN(date.getTime()) || date.toISOString() !== normalised) {
    throw new Error(`MS-News returned an invalid ${field} value.`);
  }

  return normalised;
}

function comparePublicNewsPosts(left, right) {
  return right.publishAt.localeCompare(left.publishAt) || right.id.localeCompare(left.id);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

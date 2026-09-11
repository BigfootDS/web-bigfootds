export const LIVE_OPS_PAGE_SIZE = 20;
export const MAXIMUM_LIVE_OPS_QUERY_LENGTH = 120;
const maximumCursorLength = 512;
const maximumCatalogueItemCount = 100;
const maximumIdentifierLength = 80;
const maximumSummaryLength = 500;
const maximumTagCount = 10;
const maximumTitleLength = 120;
const cursorPattern = /^[A-Za-z0-9_-]+$/;
const stableIdentifierPattern = /^[a-z][a-z0-9._-]{0,79}$/;
const liveOpsConfigTypes = new Set(['content_set', 'event_schedule', 'reward_schedule', 'shop_rotation']);

/**
 * Reads the visitor-controlled, shareable discovery state. This is a small
 * literal query language only: malformed identifiers are discarded instead of
 * being forwarded to the public service as arbitrary request input.
 *
 * @param {URLSearchParams} searchParams - Query string from the live-ops page.
 * @returns {{ project?: string, q?: string, tag?: string, type?: string }} Valid filter state.
 */
export function readLiveOpsFilters(searchParams) {
  const q = normaliseQuery(searchParams.get('q'));
  const project = normaliseStableIdentifier(searchParams.get('project'));
  const type = normaliseConfigType(searchParams.get('type'));
  const tag = normaliseStableIdentifier(searchParams.get('tag'));

  return {
    ...(q === undefined ? {} : { q }),
    ...(project === undefined ? {} : { project }),
    ...(type === undefined ? {} : { type }),
    ...(tag === undefined ? {} : { tag })
  };
}

/**
 * Reads an opaque service cursor without interpreting its contents. A cursor
 * belongs to the exact filter set that produced it, so callers reset it when a
 * visitor changes a filter.
 *
 * @param {URLSearchParams} searchParams - Query string from the live-ops page.
 * @returns {string | undefined} A bounded opaque cursor, when valid.
 */
export function readLiveOpsCursor(searchParams) {
  const cursor = searchParams.get('cursor');

  return typeof cursor === 'string' && cursorPattern.test(cursor) && cursor.length <= maximumCursorLength
    ? cursor
    : undefined;
}

/**
 * Serialises filters in a stable order, avoiding browser-only state that a
 * visitor cannot copy, revisit, or send to another player.
 *
 * @param {{ project?: string, q?: string, tag?: string, type?: string }} filters - Filter state.
 * @param {string | undefined} [cursor] - Opaque continuation cursor from the service.
 * @returns {URLSearchParams} Canonical URL parameters for `/live-ops/`.
 */
export function serialiseLiveOpsFilters(filters, cursor = undefined) {
  const parameters = new URLSearchParams();
  const q = normaliseQuery(filters.q ?? null);
  const project = normaliseStableIdentifier(filters.project ?? null);
  const type = normaliseConfigType(filters.type ?? null);
  const tag = normaliseStableIdentifier(filters.tag ?? null);

  if (q !== undefined) parameters.set('q', q);
  if (project !== undefined) parameters.set('project', project);
  if (type !== undefined) parameters.set('type', type);
  if (tag !== undefined) parameters.set('tag', tag);
  if (cursor !== undefined && cursorPattern.test(cursor) && cursor.length <= maximumCursorLength) {
    parameters.set('cursor', cursor);
  }

  return parameters;
}

/**
 * Builds the anonymous catalogue request from a deployment-owned API origin.
 * The origin is intentionally limited to a bare HTTP(S) origin, preventing a
 * public environment value from smuggling credentials or a different route
 * into each visitor request.
 *
 * @param {string | undefined} publicApiBaseUrl - `PUBLIC_LIVEOPS_CONFIG_BASE_URL` value.
 * @param {{ project?: string, q?: string, tag?: string, type?: string }} filters - Valid filter state.
 * @param {string | undefined} [cursor] - Opaque continuation cursor.
 * @returns {URL} Service URL for the public catalogue.
 * @throws {Error} When the public API origin is absent or unsafe.
 */
export function createLiveOpsCatalogueUrl(publicApiBaseUrl, filters, cursor = undefined) {
  const origin = readPublicApiOrigin(publicApiBaseUrl);
  const url = new URL('/api/v1/live-ops/public', origin);
  const parameters = serialiseLiveOpsFilters(filters, cursor);
  parameters.set('limit', String(LIVE_OPS_PAGE_SIZE));
  url.search = parameters;
  return url;
}

/**
 * Provides the privacy-preserving request options shared by every public
 * catalogue read. The LiveOps browser page is anonymous, so it must not send
 * website cookies or a referrer that could include a visitor's filter query.
 *
 * @param {AbortSignal} signal - Controller signal for cancelling a stale page request.
 * @returns {RequestInit} Fetch options for the public catalogue only.
 */
export function createPublicLiveOpsRequestInit(signal) {
  return {
    cache: 'no-store',
    credentials: 'omit',
    headers: { accept: 'application/json' },
    referrerPolicy: 'no-referrer',
    signal
  };
}

/**
 * Validates the deliberately small public response before UI code reads it.
 * The browser never receives a generic LiveOps configuration payload, internal
 * configuration key, revision ID, content hash, or staff identity.
 *
 * @param {unknown} value - Parsed JSON response from the public catalogue.
 * @returns {{ items: readonly PublicLiveOpsItem[], nextCursor?: string }} Validated public summaries.
 * @throws {Error} When the response is not the documented public DTO.
 */
export function readPublicLiveOpsCatalogue(value) {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > maximumCatalogueItemCount) {
    throw new Error('MS-LiveOpsConfig returned an invalid public catalogue response.');
  }

  const nextCursor = value.nextCursor === undefined
    ? undefined
    : readCursor(value.nextCursor, 'nextCursor');

  return {
    items: value.items.map((item, index) => readPublicLiveOpsItem(item, index)),
    ...(nextCursor === undefined ? {} : { nextCursor })
  };
}

/** @typedef {{ configType: string, endsAt?: string, id: string, projectId: string, startsAt: string, summary: string, tags: readonly string[], title: string }} PublicLiveOpsItem */

function readPublicApiOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Set PUBLIC_LIVEOPS_CONFIG_BASE_URL to the public MS-LiveOpsConfig origin before browsing Live Ops content.');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('PUBLIC_LIVEOPS_CONFIG_BASE_URL must be a bare HTTP(S) origin.');
  }

  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((url.protocol !== 'https:' && !localHttp)
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== '') {
    throw new Error('PUBLIC_LIVEOPS_CONFIG_BASE_URL must be a bare HTTPS origin, or HTTP localhost for local development.');
  }

  return url.origin;
}

function readPublicLiveOpsItem(value, index) {
  if (!isRecord(value)) throw new Error(`Live Ops catalogue item ${index + 1} is invalid.`);

  const allowedKeys = new Set(['configType', 'endsAt', 'id', 'projectId', 'startsAt', 'summary', 'tags', 'title']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(`Live Ops catalogue item ${index + 1} contains non-public fields.`);
  }

  const startsAt = readIsoTimestamp(value.startsAt, 'startsAt', index);
  const endsAt = value.endsAt === undefined ? undefined : readIsoTimestamp(value.endsAt, 'endsAt', index);
  if (endsAt !== undefined && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error(`Live Ops catalogue item ${index + 1} ends before it starts.`);
  }

  return {
    id: readStableIdentifier(value.id, 'id', index),
    projectId: readStableIdentifier(value.projectId, 'projectId', index),
    configType: readConfigType(value.configType, index),
    title: readBoundedText(value.title, 'title', maximumTitleLength, index),
    summary: readBoundedText(value.summary, 'summary', maximumSummaryLength, index),
    tags: readTags(value.tags, index),
    startsAt,
    ...(endsAt === undefined ? {} : { endsAt })
  };
}

function readStableIdentifier(value, field, index) {
  if (typeof value !== 'string' || !stableIdentifierPattern.test(value) || value.length > maximumIdentifierLength) {
    throw new Error(`Live Ops catalogue item ${index + 1} has an invalid ${field}.`);
  }

  return value;
}

function readBoundedText(value, field, maximumLength, index) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximumLength) {
    throw new Error(`Live Ops catalogue item ${index + 1} has an invalid ${field}.`);
  }

  return value;
}

function readConfigType(value, index) {
  const type = normaliseConfigType(value);
  if (type === undefined) throw new Error(`Live Ops catalogue item ${index + 1} has an invalid configType.`);
  return type;
}

function readTags(value, index) {
  if (!Array.isArray(value) || value.length > maximumTagCount) {
    throw new Error(`Live Ops catalogue item ${index + 1} has invalid tags.`);
  }

  return value.map((tag) => readStableIdentifier(tag, 'tag', index));
}

function readIsoTimestamp(value, field, index) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`Live Ops catalogue item ${index + 1} has an invalid ${field}.`);
  }

  return value;
}

function readCursor(value, field) {
  if (typeof value !== 'string' || !cursorPattern.test(value) || value.length > maximumCursorLength) {
    throw new Error(`MS-LiveOpsConfig returned an invalid ${field}.`);
  }

  return value;
}

function normaliseQuery(value) {
  if (typeof value !== 'string') return undefined;

  const normalised = value.normalize('NFKC').trim().slice(0, MAXIMUM_LIVE_OPS_QUERY_LENGTH);
  return normalised === '' ? undefined : normalised;
}

function normaliseStableIdentifier(value) {
  if (typeof value !== 'string') return undefined;

  const normalised = value.normalize('NFKC').trim().toLowerCase();
  return stableIdentifierPattern.test(normalised) ? normalised : undefined;
}

function normaliseConfigType(value) {
  const normalised = normaliseStableIdentifier(value);
  return normalised !== undefined && liveOpsConfigTypes.has(normalised) ? normalised : undefined;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const LIVE_OPS_PAGE_SIZE = 20;
export const MAXIMUM_LIVE_OPS_QUERY_LENGTH = 100;
const maximumCursorLength = 512;
const maximumCatalogueItemCount = 100;
const maximumIdentifierLength = 80;
const maximumSummaryLength = 600;
const maximumTagCount = 12;
const maximumTitleLength = 160;
const cursorPattern = /^[A-Za-z0-9_-]+$/;
const publicEventIdPattern = /^evt_[a-f0-9]{32}$/;
const stableIdentifierPattern = /^[a-z][a-z0-9._-]{0,79}$/;

/**
 * Reads the visitor-controlled, shareable discovery state. This is a small
 * literal query language only: malformed identifiers are discarded instead of
 * being forwarded to the public service as arbitrary request input.
 *
 * @param {URLSearchParams} searchParams - Query string from the public events page.
 * @returns {{ project?: string, q?: string, tag?: string }} Valid filter state.
 */
export function readLiveOpsFilters(searchParams) {
  const q = normaliseQuery(searchParams.get('q'));
  const project = normaliseStableIdentifier(searchParams.get('project'));
  const tag = normaliseStableIdentifier(searchParams.get('tag'));

  return {
    ...(q === undefined ? {} : { q }),
    ...(project === undefined ? {} : { project }),
    ...(tag === undefined ? {} : { tag })
  };
}

/**
 * Reads an opaque service cursor without interpreting its contents. A cursor
 * belongs to the exact filter set that produced it, so callers reset it when a
 * visitor changes a filter.
 *
 * @param {URLSearchParams} searchParams - Query string from the public events page.
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
 * @param {{ project?: string, q?: string, tag?: string }} filters - Filter state.
 * @param {string | undefined} [cursor] - Opaque continuation cursor from the service.
 * @returns {URLSearchParams} Canonical URL parameters for `/events/`.
 */
export function serialiseLiveOpsFilters(filters, cursor = undefined) {
  const parameters = new URLSearchParams();
  const q = normaliseQuery(filters.q ?? null);
  const project = normaliseStableIdentifier(filters.project ?? null);
  const tag = normaliseStableIdentifier(filters.tag ?? null);

  if (q !== undefined) parameters.set('q', q);
  if (project !== undefined) parameters.set('project', project);
  if (tag !== undefined) parameters.set('tag', tag);
  if (cursor !== undefined && cursorPattern.test(cursor) && cursor.length <= maximumCursorLength) {
    parameters.set('cursor', cursor);
  }

  return parameters;
}

/**
 * Builds the anonymous public-events request from a deployment-owned API origin.
 * The origin is intentionally limited to a bare HTTP(S) origin, preventing a
 * public environment value from smuggling credentials or a different route
 * into each visitor request.
 *
 * @param {string | undefined} publicApiBaseUrl - Derived `PUBLIC_MS_LIVEOPSCONFIG_BASE_URL` browser-build value.
 * @param {{ project?: string, q?: string, tag?: string }} filters - Valid filter state.
 * @param {string | undefined} [cursor] - Opaque continuation cursor.
 * @returns {URL} Service URL for the public events endpoint.
 * @throws {Error} When the public API origin is absent or unsafe.
 */
export function createLiveOpsCatalogueUrl(publicApiBaseUrl, filters, cursor = undefined) {
  const origin = readPublicApiOrigin(publicApiBaseUrl);
  const url = new URL('/api/v1/events', origin);
  const parameters = serialiseLiveOpsFilters(filters, cursor);
  parameters.set('limit', String(LIVE_OPS_PAGE_SIZE));
  url.search = parameters;
  return url;
}

/**
 * Builds an anonymous request that confirms whether a statically generated
 * player Event page remains public and active. The event ID is already an
 * opaque URL segment; callers may not pass a configuration key or arbitrary
 * service path in its place.
 *
 * @param {string | undefined} publicApiBaseUrl - Derived browser-build API origin.
 * @param {string} eventId - Opaque public Event identifier.
 * @returns {URL} Service URL for one public Event detail projection.
 * @throws {Error} When the origin or Event identifier is unsafe.
 */
export function createEventDetailUrl(publicApiBaseUrl, eventId) {
  const origin = readPublicApiOrigin(publicApiBaseUrl);
  const identifier = readEventIdentifier(eventId);
  return new URL(`/api/v1/events/${encodeURIComponent(identifier)}`, origin);
}

/**
 * Provides the privacy-preserving request options shared by every public
 * events read. The player-facing browser page is anonymous, so it must not send
 * website cookies or a referrer that could include a visitor's filter query.
 *
 * @param {AbortSignal} signal - Controller signal for cancelling a stale page request.
 * @returns {RequestInit} Fetch options for public event reads only.
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
 * Marks the latest asynchronous page load. Aborting a fetch cannot prevent a
 * response that already resolved from continuing, so callers must check the
 * returned predicate again after every await before changing the document.
 *
 * @returns {{ begin: () => () => boolean }} Coordinator for one rendered catalogue page.
 */
export function createLatestLiveOpsRequestCoordinator() {
  let latestRequest = 0;

  return {
    begin() {
      const request = ++latestRequest;
      return () => request === latestRequest;
    }
  };
}

/**
 * Validates the deliberately small public events response before UI code reads it.
 * The browser never receives a generic configuration payload, internal
 * configuration key, revision ID, content hash, or staff identity.
 *
 * @param {unknown} value - Parsed JSON response from the public catalogue.
 * @returns {{ items: readonly PublicLiveOpsItem[], nextCursor?: string }} Validated public summaries.
 * @throws {Error} When the response is not the documented public DTO.
 */
export function readPublicLiveOpsCatalogue(value) {
  if (!isRecord(value) || !Array.isArray(value.items) || value.items.length > maximumCatalogueItemCount) {
    throw new Error('The Events API returned an invalid public response.');
  }

  const nextCursor = value.nextCursor === undefined
    ? undefined
    : readCursor(value.nextCursor, 'nextCursor');

  return {
    items: value.items.map((item, index) => readPublicLiveOpsItem(item, index)),
    ...(nextCursor === undefined ? {} : { nextCursor })
  };
}

/**
 * Validates the exact anonymous Event detail envelope. Keeping this distinct
 * from the list parser prevents a newly added service field from becoming
 * browser-visible before the player-facing contract is reviewed.
 *
 * @param {unknown} value - Parsed JSON response from the public Event route.
 * @returns {PublicLiveOpsItem} Validated public Event detail.
 * @throws {Error} When the response is not the documented public DTO.
 */
export function readPublicLiveOpsEvent(value) {
  if (!isRecord(value) || !isRecord(value.event) || Object.keys(value).length !== 1) {
    throw new Error('The Events API returned an invalid public event response.');
  }

  return readPublicLiveOpsItem(value.event, 0);
}

/** @typedef {{ endsAt?: string, id: string, projectId: string, startsAt: string, summary: string, tags: readonly string[], title: string }} PublicLiveOpsItem */

function readPublicApiOrigin(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('PUBLIC_MS_LIVEOPSCONFIG_BASE_URL is required before browsing events.');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('PUBLIC_MS_LIVEOPSCONFIG_BASE_URL must be a bare HTTP(S) origin.');
  }

  const localHttp = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if ((url.protocol !== 'https:' && !localHttp)
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== '') {
    throw new Error('PUBLIC_MS_LIVEOPSCONFIG_BASE_URL must be a bare HTTPS origin, or HTTP localhost for local development.');
  }

  return url.origin;
}

function readPublicLiveOpsItem(value, index) {
  if (!isRecord(value)) throw new Error(`Event item ${index + 1} is invalid.`);

  const allowedKeys = new Set(['endsAt', 'id', 'projectId', 'startsAt', 'summary', 'tags', 'title']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(`Event item ${index + 1} contains non-public fields.`);
  }

  const startsAt = readIsoTimestamp(value.startsAt, 'startsAt', index);
  const endsAt = value.endsAt === undefined ? undefined : readIsoTimestamp(value.endsAt, 'endsAt', index);
  if (endsAt !== undefined && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error(`Event item ${index + 1} ends before it starts.`);
  }

  return {
    id: readEventIdentifier(value.id),
    projectId: readStableIdentifier(value.projectId, 'projectId', index),
    title: readBoundedText(value.title, 'title', maximumTitleLength, index),
    summary: readBoundedText(value.summary, 'summary', maximumSummaryLength, index),
    tags: readTags(value.tags, index),
    startsAt,
    ...(endsAt === undefined ? {} : { endsAt })
  };
}

function readStableIdentifier(value, field, index) {
  if (typeof value !== 'string' || !stableIdentifierPattern.test(value) || value.length > maximumIdentifierLength) {
    throw new Error(`Event item ${index + 1} has an invalid ${field}.`);
  }

  return value;
}

function readEventIdentifier(value) {
  if (typeof value !== 'string' || !publicEventIdPattern.test(value)) {
    throw new Error('Event ID must be an opaque evt_ identifier.');
  }

  return value;
}

function readBoundedText(value, field, maximumLength, index) {
  if (typeof value !== 'string' || value.trim() === '' || value.length > maximumLength) {
    throw new Error(`Event item ${index + 1} has an invalid ${field}.`);
  }

  return value;
}

function readTags(value, index) {
  if (!Array.isArray(value) || value.length > maximumTagCount) {
    throw new Error(`Event item ${index + 1} has invalid tags.`);
  }

  return value.map((tag) => readStableIdentifier(tag, 'tag', index));
}

function readIsoTimestamp(value, field, index) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new Error(`Event item ${index + 1} has an invalid ${field}.`);
  }

  return value;
}

function readCursor(value, field) {
  if (typeof value !== 'string' || !cursorPattern.test(value) || value.length > maximumCursorLength) {
    throw new Error(`The Events API returned an invalid ${field}.`);
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

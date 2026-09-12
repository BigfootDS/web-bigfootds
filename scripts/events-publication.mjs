import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const EVENTS_API_BASE_URL_ENVIRONMENT_VARIABLE = 'MS_LIVEOPSCONFIG_BASE_URL';
const EVENTS_LIST_PATH = '/api/v1/events';
const MAXIMUM_EVENT_COUNT = 10_000;
const MAXIMUM_PAGE_COUNT = 200;
const MAXIMUM_PAGE_SIZE = 50;
const maximumIdentifierLength = 80;
const maximumSummaryLength = 600;
const maximumTagCount = 12;
const maximumTitleLength = 160;
const publicEventIdPattern = /^evt_[a-f0-9]{32}$/;
const stableIdentifierPattern = /^[a-z][a-z0-9._-]{0,79}$/;

/**
 * Returns the deployment-owned public MS-LiveOpsConfig origin used only while
 * generating static player Event pages. Browser code uses the separately
 * prefixed public build value because Astro intentionally exposes only those
 * environment variables to client modules.
 *
 * @param {string | undefined} configuredValue - Non-secret build environment value.
 * @returns {string} Canonical origin without a trailing slash.
 * @throws {Error} When the configured API origin is absent or unsafe.
 */
export function readEventsApiBaseUrl(configuredValue) {
  if (typeof configuredValue !== 'string' || configuredValue.trim() === '') {
    throw new Error(
      `${EVENTS_API_BASE_URL_ENVIRONMENT_VARIABLE} is required to build public event pages. `
      + 'Set it to the public MS-LiveOpsConfig HTTP(S) origin, then run npm run events:sync.'
    );
  }

  let url;
  try {
    url = new URL(configuredValue.trim());
  } catch {
    throw new Error(`${EVENTS_API_BASE_URL_ENVIRONMENT_VARIABLE} must be a valid HTTP(S) origin.`);
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
      `${EVENTS_API_BASE_URL_ENVIRONMENT_VARIABLE} must be a bare public HTTP(S) origin without credentials, a path, query, or fragment.`
    );
  }

  return url.origin;
}

/**
 * Downloads the bounded anonymous Event catalogue and turns it into one
 * deterministic snapshot. The API cursor is deliberately followed in order;
 * a loop, duplicate ID, malformed item, or unexpected page count stops the
 * build instead of publishing a partial list of player-visible routes.
 *
 * @param {{ apiBaseUrl: string, fetchImpl?: typeof fetch }} options - Public source settings.
 * @returns {Promise<{ events: readonly PublicEvent[], version: 1 }>} Sorted public Event snapshot.
 */
export async function fetchPublicEvents(options) {
  const apiBaseUrl = readEventsApiBaseUrl(options.apiBaseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const events = [];
  const seenCursors = new Set();
  const seenIds = new Set();
  let cursor;

  for (let pageNumber = 1; pageNumber <= MAXIMUM_PAGE_COUNT; pageNumber += 1) {
    const url = new URL(EVENTS_LIST_PATH, apiBaseUrl);
    url.searchParams.set('limit', String(MAXIMUM_PAGE_SIZE));
    if (cursor !== undefined) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetchImpl(url);
    if (!response.ok) {
      throw new Error(`MS-LiveOpsConfig public Events request failed with HTTP ${response.status}.`);
    }

    const page = normalisePublicEventsPage(await response.json());
    for (const event of page.items) {
      if (seenIds.has(event.id)) {
        throw new Error(`MS-LiveOpsConfig returned duplicate public Event ID ${event.id}.`);
      }

      seenIds.add(event.id);
      events.push(event);
      if (events.length > MAXIMUM_EVENT_COUNT) {
        throw new Error(`MS-LiveOpsConfig returned more than ${MAXIMUM_EVENT_COUNT} public Events.`);
      }
    }

    if (page.nextCursor === undefined) {
      return { events: events.sort(comparePublicEvents), version: 1 };
    }

    if (seenCursors.has(page.nextCursor)) {
      throw new Error('MS-LiveOpsConfig returned a repeated public Events cursor.');
    }

    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  throw new Error(`MS-LiveOpsConfig returned more than ${MAXIMUM_PAGE_COUNT} public Events pages.`);
}

/**
 * Atomically replaces the ignored snapshot consumed by Astro. An Event which
 * has ended or been unpublished is absent from the following successful
 * build; deployed static files additionally confirm availability at runtime.
 *
 * @param {string} outputPath - Ignored JSON snapshot path.
 * @param {{ events: readonly PublicEvent[], version: 1 }} snapshot - Validated public Event snapshot.
 * @returns {Promise<void>}
 */
export async function writePublicEventsSnapshot(outputPath, snapshot) {
  const temporaryPath = `${outputPath}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, outputPath);
}

/**
 * Reads the generated snapshot during the static Astro build. Missing,
 * malformed, or non-deterministic data is an explicit build failure rather
 * than an empty Event section that could hide a broken publication path.
 *
 * @param {string} filePath - Ignored JSON snapshot path.
 * @returns {Promise<{ events: readonly PublicEvent[], version: 1 }>}
 */
export async function readPublicEventsSnapshot(filePath) {
  let content;
  try {
    const { readFile } = await import('node:fs/promises');
    content = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      throw new Error('Generated public Events are missing. Run npm run events:sync before Astro builds the website.');
    }

    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Generated public Events are not valid JSON. Run npm run events:sync again.');
  }

  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.events)) {
    throw new Error('Generated public Events have an unsupported shape. Run npm run events:sync again.');
  }

  const events = parsed.events.map((event, index) => normalisePublicEvent(event, index));
  if (new Set(events.map((event) => event.id)).size !== events.length) {
    throw new Error('Generated public Events contain duplicate identifiers. Run npm run events:sync again.');
  }
  const sortedEvents = [...events].sort(comparePublicEvents);
  if (events.some((event, index) => event !== sortedEvents[index])) {
    throw new Error('Generated public Events are not sorted deterministically. Run npm run events:sync again.');
  }

  return { events, version: 1 };
}

/** @typedef {{ endsAt?: string, id: string, projectId: string, startsAt: string, summary: string, tags: readonly string[], title: string }} PublicEvent */

function normalisePublicEventsPage(value) {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error('MS-LiveOpsConfig returned a malformed public Events page.');
  }

  if (Object.keys(value).some((key) => key !== 'items' && key !== 'nextCursor')) {
    throw new Error('MS-LiveOpsConfig returned non-public Events page fields.');
  }

  if (value.items.length > MAXIMUM_PAGE_SIZE) {
    throw new Error('MS-LiveOpsConfig returned too many public Events in one page.');
  }

  if (value.nextCursor !== undefined && (typeof value.nextCursor !== 'string' || value.nextCursor.length === 0 || value.nextCursor.length > 128)) {
    throw new Error('MS-LiveOpsConfig returned an invalid public Events cursor.');
  }

  return {
    items: value.items.map((event, index) => normalisePublicEvent(event, index)),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor })
  };
}

function normalisePublicEvent(value, index) {
  if (!isRecord(value)) {
    throw new Error(`Public Event ${index + 1} is invalid.`);
  }

  const allowedKeys = new Set(['endsAt', 'id', 'projectId', 'startsAt', 'summary', 'tags', 'title']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new Error(`Public Event ${index + 1} contains non-public fields.`);
  }

  const startsAt = normaliseIsoTimestamp(value.startsAt, 'startsAt', index);
  const endsAt = value.endsAt === undefined ? undefined : normaliseIsoTimestamp(value.endsAt, 'endsAt', index);
  if (endsAt !== undefined && Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw new Error(`Public Event ${index + 1} ends before it starts.`);
  }

  return {
    id: normalisePublicEventIdentifier(value.id, index),
    projectId: normaliseIdentifier(value.projectId, 'projectId', index),
    title: normaliseText(value.title, 'title', maximumTitleLength, index),
    summary: normaliseText(value.summary, 'summary', maximumSummaryLength, index),
    tags: normaliseTags(value.tags, index),
    startsAt,
    ...(endsAt === undefined ? {} : { endsAt })
  };
}

function normalisePublicEventIdentifier(value, index) {
  const normalised = normaliseText(value, 'id', maximumIdentifierLength, index).toLowerCase();
  if (!publicEventIdPattern.test(normalised)) {
    throw new Error(`Public Event ${index + 1} has an invalid opaque id.`);
  }

  return normalised;
}

function normaliseIdentifier(value, field, index) {
  const normalised = normaliseText(value, field, maximumIdentifierLength, index).toLowerCase();
  if (!stableIdentifierPattern.test(normalised)) {
    throw new Error(`Public Event ${index + 1} has an invalid ${field}.`);
  }

  return normalised;
}

function normaliseText(value, field, maximumLength, index) {
  if (typeof value !== 'string') {
    throw new Error(`Public Event ${index + 1} has a non-text ${field}.`);
  }

  const normalised = value.normalize('NFC').trim();
  if (normalised.length === 0 || normalised.length > maximumLength) {
    throw new Error(`Public Event ${index + 1} has an invalid ${field}.`);
  }

  return normalised;
}

function normaliseTags(value, index) {
  if (!Array.isArray(value) || value.length > maximumTagCount) {
    throw new Error(`Public Event ${index + 1} has invalid tags.`);
  }

  const tags = value.map((tag) => normaliseIdentifier(tag, 'tag', index));
  if (new Set(tags).size !== tags.length) {
    throw new Error(`Public Event ${index + 1} has duplicate tags.`);
  }

  return tags;
}

function normaliseIsoTimestamp(value, field, index) {
  const normalised = normaliseText(value, field, 30, index);
  const date = new Date(normalised);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== normalised) {
    throw new Error(`Public Event ${index + 1} has an invalid ${field}.`);
  }

  return normalised;
}

function comparePublicEvents(left, right) {
  return right.startsAt.localeCompare(left.startsAt) || left.id.localeCompare(right.id);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { normaliseRichNewsDocument } from './news-rich-document.mjs';

const maximumTokenLength = 8_192;
const maximumUploadBytes = 10 * 1024 * 1024;
const maximumPreviewUrlLength = 8_192;
const tokenPattern = /^[A-Za-z0-9._~-]+$/;
const postIdPattern = /^[a-f0-9]{24}$/i;
const assetIdPattern = /^nma_[a-f0-9]{32}$/;
const localePattern = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|[0-9]{3})?$/;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const statuses = new Set(['draft', 'published', 'unpublished', 'archived']);
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * A safe classification for staff-News browser failures.
 *
 * Neither service responses nor request URLs are retained in this error, so a
 * UI can provide useful feedback without disclosing deployment or auth detail.
 */
export class EditorialNewsApiError extends Error {
  /** @param {'configuration' | 'conflict' | 'invalid-response' | 'not-found' | 'rejected' | 'unavailable' | 'validation'} kind Safe presentation category. */
  constructor(kind) {
    super('The staff News request could not be completed.');
    this.kind = kind;
  }
}

/**
 * Reads the browser-safe MS-News origin used for authenticated editorial calls.
 *
 * The public build value is deliberately only a bare HTTPS origin, or a
 * loopback HTTP origin during development. It cannot select a different route
 * or include a credential in a request that carries a human token pair.
 *
 * @param {string | undefined} value Public Astro build value.
 * @returns {string} Canonical MS-News origin without a trailing slash.
 */
export function readPublicEditorialNewsBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EditorialNewsApiError('configuration');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new EditorialNewsApiError('configuration');
  }

  const localHttp = url.protocol === 'http:' && isLoopbackHost(url.hostname);
  if (
    (url.protocol !== 'https:' && !localHttp)
    || url.username !== ''
    || url.password !== ''
    || url.pathname !== '/'
    || url.search !== ''
    || url.hash !== ''
  ) {
    throw new EditorialNewsApiError('configuration');
  }

  return url.origin;
}

/**
 * Creates the fixed, selected-locale staff list request.
 *
 * MS-News determines staff authority from the bearer token after it asks
 * MS-Auth to attest it. The companion token-pair headers preserve the chosen
 * direct-client transport, but this helper never accepts arbitrary paths.
 *
 * @param {{ apiBaseUrl: string | undefined, cursor?: string, limit?: number, locale: string, projectId?: string, session: { accessToken: string, refreshToken: string }, status?: string }} input List filters and direct-client session.
 * @returns {{ init: RequestInit, url: URL }} A no-store request for the staff list endpoint.
 */
export function createEditorialNewsListRequest(input) {
  const locale = readLocale(input.locale);
  const parameters = new URLSearchParams({ locale });
  if (input.cursor !== undefined) {
    if (typeof input.cursor !== 'string' || input.cursor.length === 0 || input.cursor.length > 500) {
      throw new EditorialNewsApiError('validation');
    }
    parameters.set('cursor', input.cursor);
  }
  if (input.limit !== undefined) {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
      throw new EditorialNewsApiError('validation');
    }
    parameters.set('limit', String(input.limit));
  }
  if (input.projectId !== undefined) parameters.set('projectId', readSlug(input.projectId));
  if (input.status !== undefined) parameters.set('status', readStatus(input.status));

  return createEditorialRequest({
    apiBaseUrl: input.apiBaseUrl,
    pathname: `/api/v1/editorial/news?${parameters.toString()}`,
    session: input.session,
    method: 'GET'
  });
}

/**
 * Creates a staff read or lifecycle request for an opaque News post ID.
 *
 * The optional body must be a JSON-safe object created by a component. This
 * module validates the endpoint choice but leaves content-field validation to
 * `createEditorialNewsPostInput`, which is shared with the WYSIWYG editor.
 *
 * @param {{ apiBaseUrl: string | undefined, body?: object, id: string, operation: 'create' | 'read' | 'save' | 'schedule' | 'publish' | 'unpublish', session: { accessToken: string, refreshToken: string } }} input Fixed operation and session.
 * @returns {{ init: RequestInit, url: URL }} Safe no-store staff request.
 */
export function createEditorialNewsPostRequest(input) {
  const operation = input.operation;
  const postId = operation === 'create' ? undefined : readPostId(input.id);
  const routes = {
    create: { method: 'POST', pathname: '/api/v1/editorial/news' },
    publish: { method: 'POST', pathname: `/api/v1/editorial/news/${postId}/publish` },
    read: { method: 'GET', pathname: `/api/v1/editorial/news/${postId}` },
    save: { method: 'PUT', pathname: `/api/v1/editorial/news/${postId}` },
    schedule: { method: 'POST', pathname: `/api/v1/editorial/news/${postId}/schedule` },
    unpublish: { method: 'POST', pathname: `/api/v1/editorial/news/${postId}/unpublish` }
  }[operation];
  if (routes === undefined) throw new EditorialNewsApiError('validation');
  if (operation === 'create' && input.id !== '') throw new EditorialNewsApiError('validation');
  if (['create', 'save', 'schedule'].includes(operation) && !isRecord(input.body)) {
    throw new EditorialNewsApiError('validation');
  }
  if (['read', 'publish', 'unpublish'].includes(operation) && input.body !== undefined) {
    throw new EditorialNewsApiError('validation');
  }

  return createEditorialRequest({
    apiBaseUrl: input.apiBaseUrl,
    ...(input.body === undefined ? {} : { body: input.body }),
    method: routes.method,
    pathname: routes.pathname,
    session: input.session
  });
}

/**
 * Creates one image-upload intent request. The response is only an expiring
 * form capability; browser auth headers are never sent to Cloud Storage.
 *
 * @param {{ apiBaseUrl: string | undefined, byteLength: number, contentType: string, session: { accessToken: string, refreshToken: string } }} input Image metadata declared by the selected file.
 * @returns {{ init: RequestInit, url: URL }} Staff request for one media upload intent.
 */
export function createEditorialMediaUploadIntentRequest(input) {
  const contentType = readImageContentType(input.contentType);
  const byteLength = readByteLength(input.byteLength);
  return createEditorialRequest({
    apiBaseUrl: input.apiBaseUrl,
    body: { byteLength, contentType },
    method: 'POST',
    pathname: '/api/v1/editorial/news-media/upload-intents',
    session: input.session
  });
}

/** Creates the empty-body completion request for one opaque uploaded image. */
export function createEditorialMediaCompleteRequest({ apiBaseUrl, assetId, session }) {
  return createEditorialRequest({
    apiBaseUrl,
    method: 'POST',
    pathname: `/api/v1/editorial/news-media/${readAssetId(assetId)}/complete`,
    session
  });
}

/**
 * Requests a private JSON capability using only the human bearer credential.
 * The image must be fetched separately: following a cross-origin API redirect
 * would give the storage request an Origin of null. Refuse redirects here so
 * no unexpected response can silently restore that broken transport.
 */
export function createEditorialMediaPreviewRequest({ apiBaseUrl, assetId, session }) {
  const safeSession = readSession(session);
  return {
    init: {
      cache: 'no-store',
      credentials: 'omit',
      headers: new Headers({ accept: 'application/json', Authorization: `Bearer ${safeSession.accessToken}` }),
      method: 'GET',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    },
    url: new URL(
      `/api/v1/editorial/news-media/${readAssetId(assetId)}/preview-capability`,
      readPublicEditorialNewsBaseUrl(apiBaseUrl)
    )
  };
}

/**
 * Parses the compact selected-locale staff list without accepting audit data.
 *
 * @param {unknown} value JSON returned by `GET /api/v1/editorial/news`.
 * @returns {{ nextCursor: string | undefined, results: readonly EditorialNewsListItem[] }} Bounded list page safe to render.
 */
export function readEditorialNewsList(value) {
  try {
    if (!isExactRecord(value, ['pagination', 'results']) || !Array.isArray(value.results) || value.results.length > 50) {
      throw new Error('invalid response');
    }
    if (!isExactRecord(value.pagination, ['nextCursor']) || (value.pagination.nextCursor !== null && typeof value.pagination.nextCursor !== 'string')) {
      throw new Error('invalid response');
    }
    if (typeof value.pagination.nextCursor === 'string' && (value.pagination.nextCursor.length === 0 || value.pagination.nextCursor.length > 500)) {
      throw new Error('invalid response');
    }

    return {
      nextCursor: value.pagination.nextCursor ?? undefined,
      results: value.results.map(readEditorialNewsListItem)
    };
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }
}

/**
 * Parses a full mutation or read response while omitting staff audit identity.
 *
 * Both rich and historical plain-text bodies are accepted. The latter is
 * converted by `createRichDocumentFromLegacyBody` only when an editor chooses
 * to save the post, so loading never rewrites canonical server data.
 *
 * @param {unknown} value JSON returned by a staff post endpoint.
 * @returns {EditorialNewsPost} Complete staff-safe post.
 */
export function readEditorialNewsPost(value) {
  try {
    if (!isExactRecord(value, ['result'])) throw new Error('invalid response');
    return readEditorialNewsPostRecord(value.result);
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }
}

/** Maps an HTTP response to a safe staff list result. */
export async function readEditorialNewsListResponse(response) {
  if (!response.ok) throw responseError(response.status);
  try {
    return readEditorialNewsList(await response.json());
  } catch (error) {
    if (error instanceof EditorialNewsApiError) throw error;
    throw new EditorialNewsApiError('invalid-response');
  }
}

/** Maps an HTTP response to a safe full staff record. */
export async function readEditorialNewsPostResponse(response) {
  if (!response.ok) throw responseError(response.status);
  try {
    return readEditorialNewsPost(await response.json());
  } catch (error) {
    if (error instanceof EditorialNewsApiError) throw error;
    throw new EditorialNewsApiError('invalid-response');
  }
}

/**
 * Constructs the only editable mutation body the browser sends to MS-News.
 *
 * It normalises the Tiptap subset locally as a helpful early failure, while
 * MS-News repeats its authoritative validation before persistence.
 *
 * @param {{ category: string, contents?: readonly { document: unknown, locale: string, summary: string, title: string }[], document?: unknown, locale?: string, projectId: string, summary?: string, tags: readonly string[], title?: string }} input One or more localised rich post entries.
 * @returns {{ category: string, content: readonly object[], projectId: string, tags: readonly string[] }} Valid MS-News create/edit body.
 */
export function createEditorialNewsPostInput(input) {
  const tags = readSlugList(input.tags);
  const contentInputs = input.contents === undefined
    ? [{ document: input.document, locale: input.locale, summary: input.summary, title: input.title }]
    : input.contents;
  if (!Array.isArray(contentInputs) || contentInputs.length === 0 || contentInputs.length > 20) {
    throw new EditorialNewsApiError('validation');
  }
  const content = contentInputs.map((entry) => {
    if (!isRecord(entry)) throw new EditorialNewsApiError('validation');
    try {
      return {
        document: normaliseRichNewsDocument(entry.document),
        locale: readLocale(entry.locale),
        summary: readRequiredText(entry.summary, 600),
        title: readRequiredText(entry.title, 200)
      };
    } catch (error) {
      if (error instanceof EditorialNewsApiError) throw error;
      throw new EditorialNewsApiError('validation');
    }
  });
  if (new Set(content.map((entry) => entry.locale)).size !== content.length) {
    throw new EditorialNewsApiError('validation');
  }
  return {
    category: readSlug(input.category),
    content,
    projectId: readSlug(input.projectId),
    tags
  };
}

/**
 * Builds the strict future-only UTC scheduling body used by the ordinary
 * publication form. Historical publication has a separate date-only helper,
 * so staff cannot accidentally make a legacy post public from this control.
 */
export function createEditorialNewsScheduleInput({ now = new Date(), publishAt, unpublishAt }) {
  const publishAtDate = readIsoTimestamp(publishAt);
  if (!(now instanceof Date) || Number.isNaN(now.getTime()) || Date.parse(publishAtDate) <= now.getTime()) {
    throw new EditorialNewsApiError('validation');
  }
  const end = unpublishAt === '' || unpublishAt === undefined || unpublishAt === null
    ? null
    : readIsoTimestamp(unpublishAt);
  if (end !== null && Date.parse(end) <= Date.parse(publishAtDate)) {
    throw new EditorialNewsApiError('validation');
  }
  return { publishAt: publishAtDate, unpublishAt: end };
}

/**
 * Builds the fixed UTC schedule used when a legacy article records only a
 * calendar publication date. Midday UTC keeps the date stable in the static
 * site's UTC build output without borrowing the current editor's time zone.
 *
 * This body intentionally uses the normal staff schedule route. MS-News
 * treats a past publication time as immediately visible, while ordinary
 * publishing and future scheduling keep their existing controls.
 *
 * @param {{ now?: Date, publishedOn: string }} input Exact source calendar date in `YYYY-MM-DD` form.
 * @returns {{ publishAt: string, unpublishAt: null }} Strict MS-News publication window.
 */
export function createEditorialNewsHistoricalPublicationInput({ now = new Date(), publishedOn }) {
  if (typeof publishedOn !== 'string') throw new EditorialNewsApiError('validation');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(publishedOn);
  if (match === null) throw new EditorialNewsApiError('validation');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const timestamp = new Date(Date.UTC(year, month - 1, day, 12));
  if (
    timestamp.getUTCFullYear() !== year
    || timestamp.getUTCMonth() !== month - 1
    || timestamp.getUTCDate() !== day
    || !(now instanceof Date)
    || Number.isNaN(now.getTime())
    || timestamp.getTime() > now.getTime()
  ) {
    throw new EditorialNewsApiError('validation');
  }
  return { publishAt: timestamp.toISOString(), unpublishAt: null };
}

/** Parses the server-issued one-image Cloud Storage form capability. */
export function readEditorialMediaUploadIntent(value) {
  try {
    if (!isExactRecord(value, ['result']) || !isExactRecord(value.result, ['assetId', 'expiresAt', 'upload'])) {
      throw new Error('invalid response');
    }
    const upload = value.result.upload;
    if (
      !isExactRecord(upload, ['formFields', 'method', 'url'])
      || upload.method !== 'POST'
      || !isStringRecord(upload.formFields)
      || !isFutureIsoTimestamp(value.result.expiresAt)
      || !isHttpsUrl(upload.url)
    ) {
      throw new Error('invalid response');
    }
    return { assetId: readAssetId(value.result.assetId), expiresAt: value.result.expiresAt, upload: { formFields: upload.formFields, method: 'POST', url: upload.url } };
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }
}

/** Parses only the media metadata safe for a rich document insertion control. */
export function readEditorialMediaCompletion(value) {
  try {
    if (!isExactRecord(value, ['result']) || !isExactRecord(value.result, ['assetId', 'byteLength', 'contentType', 'dimensions', 'status'])) {
      throw new Error('invalid response');
    }
    const result = value.result;
    if (
      result.status !== 'ready'
      || !isExactRecord(result.dimensions, ['height', 'width'])
      || !Number.isInteger(result.dimensions.height) || result.dimensions.height < 1
      || !Number.isInteger(result.dimensions.width) || result.dimensions.width < 1
    ) {
      throw new Error('invalid response');
    }
    return {
      assetId: readAssetId(result.assetId),
      byteLength: readByteLength(result.byteLength),
      contentType: readImageContentType(result.contentType),
      dimensions: { height: result.dimensions.height, width: result.dimensions.width },
      status: 'ready'
    };
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }
}

/** Maps an upload-intent response to safe editor data and safe HTTP categories. */
export async function readEditorialMediaUploadIntentResponse(response) {
  if (!response.ok) throw responseError(response.status);
  try {
    return readEditorialMediaUploadIntent(await response.json());
  } catch (error) {
    if (error instanceof EditorialNewsApiError) throw error;
    throw new EditorialNewsApiError('invalid-response');
  }
}

/** Maps a verification-completion response to safe image insertion metadata. */
export async function readEditorialMediaCompletionResponse(response) {
  if (!response.ok) throw responseError(response.status);
  try {
    return readEditorialMediaCompletion(await response.json());
  } catch (error) {
    if (error instanceof EditorialNewsApiError) throw error;
    throw new EditorialNewsApiError('invalid-response');
  }
}

/**
 * Uploads one selected image directly to the server-issued form URL.
 *
 * This intentionally omits MS-News/MS-Auth headers, cookies, and any browser
 * token. The bounded form fields choose the one staging object; a browser can
 * neither name another bucket object nor obtain a storage credential.
 */
export async function sendEditorialMediaUpload({ fetchImpl = fetch, file, upload }) {
  if (!(file instanceof Blob) || !isExactRecord(upload, ['formFields', 'method', 'url']) || upload.method !== 'POST' || !isStringRecord(upload.formFields) || !isHttpsUrl(upload.url)) {
    throw new EditorialNewsApiError('validation');
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(upload.formFields)) form.append(key, value);
  form.append('file', file);
  let response;
  try {
    response = await fetchImpl(upload.url, { body: form, credentials: 'omit', method: 'POST', referrerPolicy: 'no-referrer' });
  } catch {
    throw new EditorialNewsApiError('unavailable');
  }
  if (!response.ok) throw responseError(response.status);
}

/**
 * Reads the staff capability, then starts a fresh credential-free image GET.
 *
 * The caller owns the authenticated API retry. This second request deliberately
 * receives no session, cookies or referrer and cannot follow another redirect.
 * The capability stays transient; callers must revoke the returned blob URL
 * when it is discarded, including a late result after unmount.
 * @param {{ response: Response, fetchImpl?: typeof fetch, urlApi?: Pick<typeof URL, 'createObjectURL'> }} input Attested JSON response and injectable browser boundaries.
 * @returns {Promise<string>} In-memory blob URL, never the signed storage URL.
 */
export async function readEditorialMediaPreviewResponse({ response, fetchImpl = fetch, urlApi = URL }) {
  if (!response.ok) throw responseError(response.status);
  let storageUrl;
  try {
    if (response.redirected) throw new Error('Unexpected redirect.');
    const value = await response.json();
    if (!isExactRecord(value, ['result']) || !isExactRecord(value.result, ['url'])) throw new Error('Invalid capability.');
    storageUrl = readPreviewStorageUrl(value.result.url);
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }

  let imageResponse;
  try {
    imageResponse = await fetchImpl(storageUrl, {
      cache: 'no-store',
      credentials: 'omit',
      headers: new Headers({ accept: 'image/*' }),
      method: 'GET',
      mode: 'cors',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    });
  } catch {
    throw new EditorialNewsApiError('unavailable');
  }
  if (!imageResponse.ok) throw responseError(imageResponse.status);
  try {
    const image = await imageResponse.blob();
    if (imageResponse.redirected || !supportedImageTypes.has(image.type) || image.size < 1 || image.size > maximumUploadBytes) {
      throw new Error('Invalid image response.');
    }
    return urlApi.createObjectURL(image);
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }
}

/**
 * Restricts a transient capability to the standard HTTPS Cloud Storage host.
 * The outer reader replaces failures with static errors because native URL
 * parser errors can retain their input; callers must not log those raw errors.
 * @param {unknown} value Private capability URL supplied by MS-News.
 * @returns {URL} Validated transport URL, never a persistent content value.
 */
function readPreviewStorageUrl(value) {
  if (typeof value !== 'string' || value.length > maximumPreviewUrlLength || value.trim() !== value) throw new Error('Invalid storage URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'storage.googleapis.com' || url.port || url.username || url.password || url.hash) {
    throw new Error('Invalid storage URL.');
  }
  return url;
}

/** Turns a retained legacy plain-text body into safe paragraph nodes only when the editor saves it. */
export function createRichDocumentFromLegacyBody(body) {
  const text = readRequiredText(body, 100_000);
  return normaliseRichNewsDocument({
    content: text.split(/\r?\n\s*\r?\n/).map((paragraph) => ({
      content: [{ text: paragraph.replace(/\s+/g, ' ').trim(), type: 'text' }],
      type: 'paragraph'
    })),
    format: 'tiptap-json-v1',
    type: 'doc'
  });
}

function createEditorialRequest({ apiBaseUrl, body, method, pathname, session }) {
  const safeSession = readSession(session);
  const headers = new Headers({ accept: 'application/json' });
  headers.set('Authorization', `Bearer ${safeSession.accessToken}`);
  headers.set('accessToken', safeSession.accessToken);
  headers.set('refreshToken', safeSession.refreshToken);
  if (body !== undefined) headers.set('content-type', 'application/json');
  return {
    init: {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store',
      credentials: 'omit',
      headers,
      method,
      referrerPolicy: 'no-referrer'
    },
    url: new URL(pathname, readPublicEditorialNewsBaseUrl(apiBaseUrl))
  };
}

function readEditorialNewsListItem(value) {
  if (!isExactRecord(value, ['category', 'id', 'locale', 'projectId', 'publishAt', 'status', 'summary', 'tags', 'title', 'unpublishAt', 'updatedAt'])) {
    throw new EditorialNewsApiError('invalid-response');
  }
  return {
    category: readSlug(value.category),
    id: readPostId(value.id),
    locale: readLocale(value.locale),
    projectId: readSlug(value.projectId),
    publishAt: readIsoTimestamp(value.publishAt),
    status: readStatus(value.status),
    summary: readRequiredText(value.summary, 600),
    tags: readSlugList(value.tags),
    title: readRequiredText(value.title, 200),
    unpublishAt: readOptionalIsoTimestamp(value.unpublishAt),
    updatedAt: readIsoTimestamp(value.updatedAt)
  };
}

function readEditorialNewsPostRecord(value) {
  if (!isExactRecord(value, ['category', 'content', 'id', 'projectId', 'publishAt', 'status', 'tags', 'unpublishAt', 'updatedAt']) || !Array.isArray(value.content) || value.content.length === 0 || value.content.length > 20) {
    throw new EditorialNewsApiError('invalid-response');
  }
  const content = value.content.map(readEditorialNewsContent);
  if (new Set(content.map((entry) => entry.locale)).size !== content.length) {
    throw new EditorialNewsApiError('invalid-response');
  }
  return {
    category: readSlug(value.category),
    content,
    id: readPostId(value.id),
    projectId: readSlug(value.projectId),
    publishAt: readIsoTimestamp(value.publishAt),
    status: readStatus(value.status),
    tags: readSlugList(value.tags),
    unpublishAt: readOptionalIsoTimestamp(value.unpublishAt),
    updatedAt: readIsoTimestamp(value.updatedAt)
  };
}

function readEditorialNewsContent(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => !['body', 'document', 'locale', 'summary', 'title'].includes(key))) {
    throw new EditorialNewsApiError('invalid-response');
  }
  const base = {
    body: readRequiredText(value.body, 100_000),
    locale: readLocale(value.locale),
    summary: readRequiredText(value.summary, 600),
    title: readRequiredText(value.title, 200)
  };
  if (value.document === undefined) return base;
  try {
    return { ...base, document: normaliseRichNewsDocument(value.document) };
  } catch {
    throw new EditorialNewsApiError('invalid-response');
  }
}

function readSession(value) {
  if (!isRecord(value)) throw new EditorialNewsApiError('validation');
  return { accessToken: readToken(value.accessToken), refreshToken: readToken(value.refreshToken) };
}

function readToken(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumTokenLength || !tokenPattern.test(value)) {
    throw new EditorialNewsApiError('validation');
  }
  return value;
}

function readPostId(value) {
  if (typeof value !== 'string' || !postIdPattern.test(value)) throw new EditorialNewsApiError('validation');
  return value;
}

function readAssetId(value) {
  if (typeof value !== 'string' || !assetIdPattern.test(value)) throw new EditorialNewsApiError('validation');
  return value;
}

function readLocale(value) {
  if (typeof value !== 'string' || !localePattern.test(value)) throw new EditorialNewsApiError('validation');
  return value;
}

function readSlug(value) {
  if (typeof value !== 'string' || !slugPattern.test(value)) throw new EditorialNewsApiError('validation');
  return value;
}

function readStatus(value) {
  if (typeof value !== 'string' || !statuses.has(value)) throw new EditorialNewsApiError('validation');
  return value;
}

function readSlugList(value) {
  if (!Array.isArray(value) || value.length > 50) throw new EditorialNewsApiError('validation');
  const tags = value.map(readSlug);
  if (new Set(tags).size !== tags.length) throw new EditorialNewsApiError('validation');
  return tags;
}

function readRequiredText(value, maximumLength) {
  if (typeof value !== 'string') throw new EditorialNewsApiError('validation');
  const text = value.trim();
  if (text.length === 0 || text.length > maximumLength) throw new EditorialNewsApiError('validation');
  return text;
}

function readByteLength(value) {
  if (!Number.isInteger(value) || value < 1 || value > maximumUploadBytes) throw new EditorialNewsApiError('validation');
  return value;
}

function readImageContentType(value) {
  if (typeof value !== 'string' || !supportedImageTypes.has(value)) throw new EditorialNewsApiError('validation');
  return value;
}

function readIsoTimestamp(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new EditorialNewsApiError('invalid-response');
  }
  return value;
}

function readOptionalIsoTimestamp(value) {
  return value === null ? null : readIsoTimestamp(value);
}

function isFutureIsoTimestamp(value) {
  try {
    return Date.parse(readIsoTimestamp(value)) > Date.now();
  } catch {
    return false;
  }
}

function isHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function responseError(status) {
  if (status === 400 || status === 422) return new EditorialNewsApiError('validation');
  if (status === 404) return new EditorialNewsApiError('not-found');
  if (status === 409) return new EditorialNewsApiError('conflict');
  return new EditorialNewsApiError(status >= 500 ? 'unavailable' : 'rejected');
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExactRecord(value, keys) {
  return isRecord(value) && Object.keys(value).every((key) => keys.includes(key)) && keys.every((key) => key in value);
}

function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

/** @typedef {{ category: string, id: string, locale: string, projectId: string, publishAt: string, status: 'draft' | 'published' | 'unpublished' | 'archived', summary: string, tags: readonly string[], title: string, unpublishAt: string | null, updatedAt: string }} EditorialNewsListItem */
/** @typedef {{ body: string, document?: import('./news-rich-document.mjs').RichNewsDocument, locale: string, summary: string, title: string }} EditorialNewsContent */
/** @typedef {{ category: string, content: readonly EditorialNewsContent[], id: string, projectId: string, publishAt: string, status: 'draft' | 'published' | 'unpublished' | 'archived', tags: readonly string[], unpublishAt: string | null, updatedAt: string }} EditorialNewsPost */

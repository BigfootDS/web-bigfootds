const maximumTokenLength = 8_192;
const tokenPattern = /^[A-Za-z0-9._~-]+$/;
const publicSocialLinkTypes = new Set([
  'website', 'discord', 'twitch', 'youtube', 'github', 'bluesky', 'mastodon', 'steam'
]);

/** Safe error categories for profile and relationship browser presentation. */
export class ProfileSocialApiError extends Error {
  /** @param {'configuration' | 'invalid-response' | 'not-found' | 'rejected' | 'unavailable' | 'validation'} kind Safe UI category. */
  constructor(kind) {
    super('Profile service request could not be completed.');
    this.kind = kind;
  }
}

/**
 * Reads a public service origin without allowing a path, credentials, or a
 * non-loopback HTTP deployment target.
 *
 * @param {string | undefined} value Public browser build value.
 * @returns {string} Canonical service origin.
 */
export function readPublicProfileServiceBaseUrl(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ProfileSocialApiError('configuration');
  }

  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProfileSocialApiError('configuration');
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
    throw new ProfileSocialApiError('configuration');
  }

  return url.origin;
}

/**
 * Creates an anonymous profile lookup request. Public profiles never need a
 * browser token and an untrusted display name cannot escape its path segment.
 */
export function createPublicProfileRequest({ apiBaseUrl, displayName }) {
  const safeDisplayName = readDisplayName(displayName);
  return {
    init: {
      cache: 'no-store',
      credentials: 'omit',
      headers: { accept: 'application/json' },
      referrerPolicy: 'no-referrer'
    },
    url: new URL(`/profiles/${encodeURIComponent(safeDisplayName)}`, readPublicProfileServiceBaseUrl(apiBaseUrl))
  };
}

/**
 * Creates an MS-Accounts request using its established bearer header plus the
 * user-selected direct-client access and refresh token pair.
 *
 * The extra pair headers are not an inferred universal service contract. They
 * are specific to the documented MS-Accounts browser boundary.
 */
export function createMsAccountsRequest({ apiBaseUrl, body, method, pathname, session }) {
  if (!['GET', 'PATCH', 'POST'].includes(method) || !['/profiles', '/profiles/me'].includes(pathname)) {
    throw new ProfileSocialApiError('validation');
  }

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
    url: new URL(pathname, readPublicProfileServiceBaseUrl(apiBaseUrl))
  };
}

/** Validates the bounded public profile representation before rendering it. */
export function readPublicProfile(value) {
  if (!isRecord(value) || Object.keys(value).some((key) => ![
    'id', 'biography', 'displayName', 'nameplate', 'profilePictureBackgroundUrl',
    'profilePictureForegroundUrl', 'socialLinks', 'tag', 'createdAt', 'updatedAt'
  ].includes(key))) {
    throw new ProfileSocialApiError('invalid-response');
  }

  const profile = {
    biography: readBoundedString(value.biography, 190),
    displayName: readDisplayName(value.displayName),
    nameplate: readBoundedString(value.nameplate, 128),
    socialLinks: readPublicSocialLinks(value.socialLinks),
    tag: readTag(value.tag)
  };

  for (const key of ['id', 'profilePictureBackgroundUrl', 'profilePictureForegroundUrl']) {
    if (value[key] !== undefined && (
      typeof value[key] !== 'string'
      || value[key].length > 2_048
      || (key !== 'id' && !isSafeHttpsUrl(value[key]))
    )) {
      throw new ProfileSocialApiError('invalid-response');
    }
  }

  if (!isTimestampOrNull(value.createdAt) || !isTimestampOrNull(value.updatedAt)) {
    throw new ProfileSocialApiError('invalid-response');
  }

  return {
    ...profile,
    ...(value.id === undefined ? {} : { id: value.id }),
    ...(value.profilePictureBackgroundUrl === undefined ? {} : { profilePictureBackgroundUrl: value.profilePictureBackgroundUrl }),
    ...(value.profilePictureForegroundUrl === undefined ? {} : { profilePictureForegroundUrl: value.profilePictureForegroundUrl })
  };
}

/** Maps an HTTP response to safe public-profile lookup results. */
export async function readPublicProfileResponse(response) {
  if (response.status === 404) throw new ProfileSocialApiError('not-found');
  if (!response.ok) throw new ProfileSocialApiError(response.status >= 500 ? 'unavailable' : 'rejected');

  try {
    return readPublicProfile(await response.json());
  } catch (error) {
    if (error instanceof ProfileSocialApiError) throw error;
    throw new ProfileSocialApiError('invalid-response');
  }
}

/**
 * Selects the editable portion of an owner's MS-Accounts response.
 *
 * Owner responses contain internal persistence fields, so this intentionally
 * returns only fields the profile editor is permitted to display or submit.
 */
export function readEditableProfile(value) {
  if (!isRecord(value)) throw new ProfileSocialApiError('invalid-response');

  return {
    biography: readOptionalBoundedString(value.biography, 190),
    displayName: readDisplayName(value.displayName),
    nameplate: readOptionalBoundedString(value.nameplate, 128),
    profilePictureBackgroundUrl: readOptionalHttpsUrl(value.profilePictureBackgroundUrl),
    profilePictureForegroundUrl: readOptionalHttpsUrl(value.profilePictureForegroundUrl),
    socialLinks: readEditableSocialLinks(value.socialLinks),
    tag: readOptionalTag(value.tag)
  };
}

/** Maps an owner profile response to safe editor data and safe HTTP categories. */
export async function readEditableProfileResponse(response) {
  if (response.status === 404) throw new ProfileSocialApiError('not-found');
  if (!response.ok) throw new ProfileSocialApiError(response.status >= 500 ? 'unavailable' : 'rejected');

  try {
    return readEditableProfile(await response.json());
  } catch (error) {
    if (error instanceof ProfileSocialApiError) throw error;
    throw new ProfileSocialApiError('invalid-response');
  }
}

function readSession(value) {
  if (!isRecord(value)) throw new ProfileSocialApiError('validation');
  return { accessToken: readToken(value.accessToken), refreshToken: readToken(value.refreshToken) };
}

function readToken(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > maximumTokenLength || !tokenPattern.test(value)) {
    throw new ProfileSocialApiError('validation');
  }
  return value;
}

function readDisplayName(value) {
  if (typeof value !== 'string' || value.length < 3 || value.length > 32 || value !== value.trim()) {
    throw new ProfileSocialApiError('validation');
  }
  return value;
}

function readBoundedString(value, maximumLength) {
  if (typeof value !== 'string' || value.length > maximumLength) throw new ProfileSocialApiError('invalid-response');
  return value;
}

function readOptionalBoundedString(value, maximumLength) {
  if (value === undefined) return '';
  return readBoundedString(value, maximumLength);
}

function readTag(value) {
  if (typeof value !== 'string' || !/^[a-z0-9]{0,4}$/.test(value)) throw new ProfileSocialApiError('invalid-response');
  return value;
}

function readOptionalTag(value) {
  return value === undefined ? '' : readTag(value);
}

function readPublicSocialLinks(value) {
  if (!Array.isArray(value) || value.length > 8) throw new ProfileSocialApiError('invalid-response');
  const sortOrders = new Set();
  const urls = new Set();

  return value.map((link) => {
    if (!isRecord(link) || Object.keys(link).some((key) => !['label', 'sortOrder', 'type', 'url'].includes(key))) {
      throw new ProfileSocialApiError('invalid-response');
    }
    if (
      typeof link.sortOrder !== 'number' || !Number.isSafeInteger(link.sortOrder)
      || link.sortOrder < 0 || link.sortOrder > 99 || sortOrders.has(link.sortOrder)
      || typeof link.type !== 'string' || !publicSocialLinkTypes.has(link.type)
      || typeof link.url !== 'string' || !isSafeHttpsUrl(link.url) || urls.has(link.url)
      || (link.label !== undefined && (typeof link.label !== 'string' || link.label.length === 0 || link.label.length > 48))
    ) {
      throw new ProfileSocialApiError('invalid-response');
    }
    sortOrders.add(link.sortOrder);
    urls.add(link.url);
    return { ...(link.label === undefined ? {} : { label: link.label }), sortOrder: link.sortOrder, type: link.type, url: link.url };
  }).sort((first, second) => first.sortOrder - second.sortOrder);
}

function readEditableSocialLinks(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) throw new ProfileSocialApiError('invalid-response');
  const sortOrders = new Set();
  const urls = new Set();

  return value.map((link) => {
    if (!isRecord(link)) throw new ProfileSocialApiError('invalid-response');
    if (
      typeof link.sortOrder !== 'number' || !Number.isSafeInteger(link.sortOrder)
      || link.sortOrder < 0 || link.sortOrder > 99 || sortOrders.has(link.sortOrder)
      || typeof link.type !== 'string' || !publicSocialLinkTypes.has(link.type)
      || typeof link.url !== 'string' || !isSafeHttpsUrl(link.url) || urls.has(link.url)
      || (link.label !== undefined && (typeof link.label !== 'string' || link.label.length === 0 || link.label.length > 48))
      || (link.visibility !== 'public' && link.visibility !== 'private')
    ) {
      throw new ProfileSocialApiError('invalid-response');
    }
    sortOrders.add(link.sortOrder);
    urls.add(link.url);
    return {
      ...(link.label === undefined ? {} : { label: link.label }),
      sortOrder: link.sortOrder,
      type: link.type,
      url: link.url,
      visibility: link.visibility
    };
  }).sort((first, second) => first.sortOrder - second.sortOrder);
}

function isSafeHttpsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function readOptionalHttpsUrl(value) {
  if (value === undefined) return '';
  if (typeof value !== 'string' || !isSafeHttpsUrl(value)) throw new ProfileSocialApiError('invalid-response');
  return value;
}

function isTimestampOrNull(value) {
  return value === null || value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)));
}

function isLoopbackHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

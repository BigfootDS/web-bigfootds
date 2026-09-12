import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ProfileSocialApiError,
  createMsAccountsRequest,
  createMsUserRelationsRequest,
  createPublicProfileRequest,
  readEditableProfile,
  readRelationshipPage,
  readRelationshipSummary,
  readPublicProfile,
  readPublicProfileResponse,
  readPublicProfileServiceBaseUrl
} from '../src/lib/profile-social-api.mjs';

const accountsBaseUrl = 'https://accounts.bigfootds.dev/';
const session = { accessToken: 'access.token-1', refreshToken: 'refresh.token-1' };

test('requires a bare public profile-service origin', () => {
  assert.equal(readPublicProfileServiceBaseUrl(accountsBaseUrl), 'https://accounts.bigfootds.dev');
  assert.equal(readPublicProfileServiceBaseUrl('http://localhost:3031'), 'http://localhost:3031');
  assert.throws(() => readPublicProfileServiceBaseUrl('https://accounts.bigfootds.dev/profiles'), isConfigurationError);
  assert.throws(() => readPublicProfileServiceBaseUrl('http://accounts.bigfootds.dev'), isConfigurationError);
});

test('builds anonymous public profile lookups and pair-carrying MS-Accounts requests', () => {
  const publicRequest = createPublicProfileRequest({ apiBaseUrl: accountsBaseUrl, displayName: 'Alex Stormwood' });
  const ownerRequest = createMsAccountsRequest({
    apiBaseUrl: accountsBaseUrl,
    method: 'PATCH',
    pathname: '/profiles/me',
    session,
    body: { biography: 'BigfootDS tinkerer.' }
  });

  assert.equal(publicRequest.url.href, 'https://accounts.bigfootds.dev/profiles/Alex%20Stormwood');
  assert.equal(publicRequest.init.credentials, 'omit');
  assert.equal('accessToken' in publicRequest.init.headers, false);
  assert.equal(ownerRequest.init.headers.get('Authorization'), 'Bearer access.token-1');
  assert.equal(ownerRequest.init.headers.get('accessToken'), 'access.token-1');
  assert.equal(ownerRequest.init.headers.get('refreshToken'), 'refresh.token-1');
  assert.equal(ownerRequest.init.credentials, 'omit');
  assert.equal(ownerRequest.init.referrerPolicy, 'no-referrer');
});

test('accepts only the public-safe profile response shape', async () => {
  const profile = {
    biography: 'BigfootDS tinkerer.',
    createdAt: '2026-09-12T00:00:00.000Z',
    displayName: 'Alex',
    id: 'profile-id',
    nameplate: 'Founder',
    socialLinks: [{ label: 'BigfootDS', sortOrder: 1, type: 'website', url: 'https://bigfootds.dev/' }],
    tag: 'a1b2',
    updatedAt: '2026-09-12T00:00:00.000Z'
  };

  assert.deepEqual(readPublicProfile(profile), {
    biography: 'BigfootDS tinkerer.',
    displayName: 'Alex',
    id: 'profile-id',
    nameplate: 'Founder',
    socialLinks: [{ label: 'BigfootDS', sortOrder: 1, type: 'website', url: 'https://bigfootds.dev/' }],
    tag: 'a1b2'
  });
  await assert.rejects(readPublicProfileResponse(new Response('not found', { status: 404 })), isNotFoundError);
  assert.throws(() => readPublicProfile({ ...profile, authUserId: 'private' }), isInvalidResponseError);
});

test('selects only editable owner profile fields and preserves private link visibility', () => {
  assert.deepEqual(readEditableProfile({
    _id: 'internal-profile-id',
    authUserId: 'internal-auth-user-id',
    biography: 'BigfootDS tinkerer.',
    displayName: 'Alex',
    displayNameNormalised: 'alex',
    socialLinks: [{ sortOrder: 1, type: 'github', url: 'https://github.com/BigfootDS', visibility: 'private' }]
  }), {
    biography: 'BigfootDS tinkerer.',
    displayName: 'Alex',
    nameplate: '',
    profilePictureBackgroundUrl: '',
    profilePictureForegroundUrl: '',
    socialLinks: [{ sortOrder: 1, type: 'github', url: 'https://github.com/BigfootDS', visibility: 'private' }],
    tag: ''
  });
});

test('uses MS-UserRelations documented pair headers without a client bearer header', () => {
  const request = createMsUserRelationsRequest({
    apiBaseUrl: 'https://userrelations.bigfootds.dev/',
    method: 'POST',
    pathname: '/api/v1/relationships/friend-requests',
    session,
    body: { targetAuthUserId: 'opaque-account-id' }
  });

  assert.equal(request.init.headers.get('accessToken'), session.accessToken);
  assert.equal(request.init.headers.get('refreshToken'), session.refreshToken);
  assert.equal(request.init.headers.get('Authorization'), null);
  assert.equal(request.init.credentials, 'omit');
});

test('accepts bounded opaque relationship data without profile fields', () => {
  assert.deepEqual(readRelationshipSummary({
    activeBlockCount: 1,
    incomingPendingCount: 3,
    outgoingPendingCount: 4,
    visibleFriendCount: 2
  }), {
    activeBlockCount: 1,
    incomingPendingCount: 3,
    outgoingPendingCount: 4,
    visibleFriendCount: 2
  });
  assert.deepEqual(readRelationshipPage({ hasMore: false, items: [{ friendAuthUserId: 'opaque-user' }], nextCursor: null }, 'friendAuthUserId'), [{ id: 'opaque-user' }]);
  assert.throws(() => readRelationshipPage({ hasMore: false, items: [{ displayName: 'not allowed' }], nextCursor: null }, 'friendAuthUserId'), isInvalidResponseError);
});

function isConfigurationError(error) {
  return error instanceof ProfileSocialApiError && error.kind === 'configuration';
}

function isInvalidResponseError(error) {
  return error instanceof ProfileSocialApiError && error.kind === 'invalid-response';
}

function isNotFoundError(error) {
  return error instanceof ProfileSocialApiError && error.kind === 'not-found';
}

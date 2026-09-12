import { useEffect, useState } from 'react';

import { readStoredBrowserAuthSession } from '../lib/browser-auth-session.mjs';
import {
  ProfileSocialApiError,
  createMsAccountsRequest,
  readEditableProfileResponse
} from '../lib/profile-social-api.mjs';
import '../styles/account-profile.css';

/**
 * Lets a signed-in visitor create or edit the profile fields owned by
 * MS-Accounts. The component never receives or renders an auth-user ID.
 *
 * @param {{ apiBaseUrl?: string }} props Public MS-Accounts origin.
 * @returns {import('react').ReactNode} Profile creation or editing surface.
 */
export default function AccountProfilePanel({ apiBaseUrl }) {
  const [profile, setProfile] = useState(undefined);
  const [phase, setPhase] = useState('loading');
  const [status, setStatus] = useState('Loading your profile…');

  useEffect(() => {
    void loadProfile();
  }, [apiBaseUrl]);

  async function loadProfile() {
    if (!apiBaseUrl) {
      setPhase('unavailable');
      setStatus('Profile editing is not available in this deployment yet.');
      return;
    }

    try {
      const session = readStoredBrowserAuthSession(window.localStorage);
      if (!session) {
        setPhase('signed-out');
        setStatus('Sign in to create or edit your profile.');
        return;
      }
      const request = createMsAccountsRequest({ apiBaseUrl, method: 'GET', pathname: '/profiles/me', session });
      const response = await fetch(request.url, request.init);
      const nextProfile = await readEditableProfileResponse(response);
      setProfile(nextProfile);
      setPhase('ready');
      setStatus('Your profile is ready to edit.');
    } catch (error) {
      if (error instanceof ProfileSocialApiError && error.kind === 'not-found') {
        setPhase('create');
        setStatus('Create your BigfootDS profile.');
        return;
      }
      setPhase(error instanceof ProfileSocialApiError && error.kind === 'rejected' ? 'signed-out' : 'unavailable');
      setStatus(statusForError(error));
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!apiBaseUrl) return;

    const formData = new FormData(event.currentTarget);
    let body;
    try {
      body = profile
        ? readUpdateInput(formData)
        : { displayName: readRequiredText(formData, 'displayName') };
    } catch {
      setStatus('Check your profile fields and social-link lines, then try again.');
      return;
    }

    try {
      const session = readStoredBrowserAuthSession(window.localStorage);
      if (!session) throw new ProfileSocialApiError('rejected');
      const request = createMsAccountsRequest({
        apiBaseUrl,
        body,
        method: profile ? 'PATCH' : 'POST',
        pathname: profile ? '/profiles/me' : '/profiles',
        session
      });
      const response = await fetch(request.url, request.init);
      if (!response.ok) throw new ProfileSocialApiError(response.status >= 500 ? 'unavailable' : 'rejected');
      setStatus(profile ? 'Your profile has been saved.' : 'Your profile has been created.');
      await loadProfile();
    } catch (error) {
      setStatus(statusForError(error));
      if (error instanceof ProfileSocialApiError && error.kind === 'rejected') setPhase('signed-out');
    }
  }

  if (phase === 'loading') return <p aria-live="polite">{status}</p>;
  if (phase === 'unavailable' || phase === 'signed-out') return <p aria-live="polite">{status}</p>;

  const editing = profile !== undefined;
  return (
    <section className="account-profile" aria-labelledby="account-profile-heading">
      <h1 id="account-profile-heading">{editing ? 'Your profile' : 'Create your profile'}</h1>
      <p aria-live="polite">{status}</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="profile-editor-display-name">Display name</label>
        <input id="profile-editor-display-name" name="displayName" defaultValue={profile?.displayName ?? ''} minLength="3" maxLength="32" required />

        {editing && <>
          <label htmlFor="profile-editor-biography">Biography</label>
          <textarea id="profile-editor-biography" name="biography" defaultValue={profile.biography} maxLength="190" rows="4" />

          <label htmlFor="profile-editor-nameplate">Nameplate</label>
          <input id="profile-editor-nameplate" name="nameplate" defaultValue={profile.nameplate} maxLength="128" />

          <label htmlFor="profile-editor-tag">Profile tag</label>
          <input id="profile-editor-tag" name="tag" defaultValue={profile.tag} maxLength="4" pattern="[a-z0-9]{4}" />

          <label htmlFor="profile-editor-background">Background image URL</label>
          <input id="profile-editor-background" name="profilePictureBackgroundUrl" type="url" defaultValue={profile.profilePictureBackgroundUrl} />

          <label htmlFor="profile-editor-foreground">Foreground image URL</label>
          <input id="profile-editor-foreground" name="profilePictureForegroundUrl" type="url" defaultValue={profile.profilePictureForegroundUrl} />

          <label htmlFor="profile-editor-social-links">Social links</label>
          <textarea
            id="profile-editor-social-links"
            name="socialLinks"
            defaultValue={serialiseSocialLinks(profile.socialLinks)}
            rows="6"
            aria-describedby="profile-editor-social-links-help"
          />
          <p id="profile-editor-social-links-help">One per line: type | HTTPS URL | public or private | optional label. Keep the lines in display order.</p>
        </>}

        <button type="submit">{editing ? 'Save profile' : 'Create profile'}</button>
      </form>
    </section>
  );
}

function readUpdateInput(formData) {
  const socialLinks = parseSocialLinks(String(formData.get('socialLinks') ?? ''));
  const tag = readText(formData, 'tag', 4);
  return {
    biography: readText(formData, 'biography', 190),
    displayName: readRequiredText(formData, 'displayName'),
    nameplate: readText(formData, 'nameplate', 128),
    profilePictureBackgroundUrl: readOptionalUrl(formData, 'profilePictureBackgroundUrl'),
    profilePictureForegroundUrl: readOptionalUrl(formData, 'profilePictureForegroundUrl'),
    socialLinks,
    ...(tag ? { tag } : {})
  };
}

function parseSocialLinks(value) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > 8) throw new Error('too many links');
  return lines.map((line, index) => {
    const [type, url, visibility, label] = line.split('|').map((part) => part.trim());
    if (!['website', 'discord', 'twitch', 'youtube', 'github', 'bluesky', 'mastodon', 'steam'].includes(type)) throw new Error('bad type');
    if (!url || !/^https:\/\//.test(url) || !['public', 'private'].includes(visibility)) throw new Error('bad link');
    if (label && label.length > 48) throw new Error('bad label');
    return { ...(label ? { label } : {}), sortOrder: index, type, url, visibility };
  });
}

function serialiseSocialLinks(links) {
  return links.map((link) => [link.type, link.url, link.visibility, link.label ?? ''].join(' | ')).join('\n');
}

function readRequiredText(formData, key) {
  const value = readText(formData, key, 190);
  if (!value) throw new Error('required');
  return value;
}

function readText(formData, key, maximumLength) {
  const value = String(formData.get(key) ?? '').trim();
  if (value.length > maximumLength) throw new Error('too long');
  return value;
}

function readOptionalUrl(formData, key) {
  const value = readText(formData, key, 2_048);
  if (!value) return undefined;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('bad url');
  return value;
}

function statusForError(error) {
  if (error instanceof ProfileSocialApiError && error.kind === 'rejected') return 'Your sign-in has ended. Please sign in again.';
  return 'Profile changes are not available right now. Please try again later.';
}

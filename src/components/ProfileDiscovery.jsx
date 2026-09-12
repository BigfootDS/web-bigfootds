import { useEffect, useState } from 'react';

import {
  ProfileSocialApiError,
  createPublicProfileRequest,
  readPublicProfileResponse
} from '../lib/profile-social-api.mjs';
import '../styles/profile-discovery.css';

/**
 * Looks up a public-safe MS-Accounts profile by display name.
 *
 * The public API intentionally returns no auth-user ID or relationship state.
 * This component therefore treats its result as presentation data only.
 *
 * @param {{ apiBaseUrl?: string }} props Public MS-Accounts origin.
 * @returns {import('react').ReactNode} Public profile discovery controls.
 */
export default function ProfileDiscovery({ apiBaseUrl }) {
  const [profile, setProfile] = useState(undefined);
  const [status, setStatus] = useState('Enter a display name to view a public profile.');

  useEffect(() => {
    const displayName = new URLSearchParams(window.location.search).get('name');
    if (displayName) void loadProfile(displayName);
  }, [apiBaseUrl]);

  async function loadProfile(displayName) {
    setProfile(undefined);
    if (!apiBaseUrl) {
      setStatus('Public profiles are not available in this deployment yet.');
      return;
    }

    try {
      const request = createPublicProfileRequest({ apiBaseUrl, displayName });
      const response = await fetch(request.url, request.init);
      const nextProfile = await readPublicProfileResponse(response);
      setProfile(nextProfile);
      setStatus(`Showing ${nextProfile.displayName}'s public profile.`);
    } catch (error) {
      setStatus(statusForError(error));
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    const displayName = String(new FormData(event.currentTarget).get('name') ?? '');
    const parameters = new URLSearchParams({ name: displayName });
    window.history.replaceState({}, '', `/profiles/?${parameters.toString()}`);
    void loadProfile(displayName);
  }

  return (
    <section className="profile-discovery" aria-labelledby="profile-discovery-heading">
      <h1 id="profile-discovery-heading">Profiles</h1>
      <p>Find a public BigfootDS profile by display name.</p>
      <form onSubmit={handleSubmit}>
        <label htmlFor="profile-display-name">Display name</label>
        <input id="profile-display-name" name="name" type="search" minLength="3" maxLength="32" required />
        <button type="submit">View profile</button>
      </form>
      <p aria-live="polite">{status}</p>
      {profile && <PublicProfile profile={profile} />}
    </section>
  );
}

function PublicProfile({ profile }) {
  return (
    <article className="public-profile" aria-label={`${profile.displayName} public profile`}>
      <h2>{profile.displayName}{profile.tag ? ` [${profile.tag}]` : ''}</h2>
      {profile.nameplate && <p>{profile.nameplate}</p>}
      {profile.profilePictureBackgroundUrl && (
        <img alt="" loading="lazy" referrerPolicy="no-referrer" src={profile.profilePictureBackgroundUrl} />
      )}
      {profile.profilePictureForegroundUrl && (
        <img alt={`${profile.displayName}'s profile`} loading="lazy" referrerPolicy="no-referrer" src={profile.profilePictureForegroundUrl} />
      )}
      {profile.biography && <p>{profile.biography}</p>}
      {profile.socialLinks.length > 0 && (
        <ul aria-label={`${profile.displayName}'s public links`}>
          {profile.socialLinks.map((link) => (
            <li key={`${link.sortOrder}-${link.url}`}>
              <a href={link.url} rel="noreferrer noopener" target="_blank">{link.label ?? link.type}</a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function statusForError(error) {
  if (error instanceof ProfileSocialApiError && error.kind === 'not-found') {
    return 'No public profile matches that display name.';
  }
  if (error instanceof ProfileSocialApiError && error.kind === 'validation') {
    return 'Use a display name between 3 and 32 characters.';
  }
  return 'Public profiles are not available right now. Please try again later.';
}

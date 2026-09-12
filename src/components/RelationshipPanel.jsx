import { useEffect, useState } from 'react';

import { readStoredBrowserAuthSession } from '../lib/browser-auth-session.mjs';
import {
  ProfileSocialApiError,
  createMsUserRelationsRequest,
  readRelationshipPage,
  readRelationshipSummary
} from '../lib/profile-social-api.mjs';
import '../styles/relationship-panel.css';

/**
 * Presents owner-only friendship and block controls backed by
 * MS-UserRelations. It shows opaque account IDs only because public profile
 * responses deliberately do not disclose an auth-user-ID mapping.
 *
 * @param {{ apiBaseUrl?: string }} props Public MS-UserRelations origin.
 * @returns {import('react').ReactNode} Relationship management controls.
 */
export default function RelationshipPanel({ apiBaseUrl }) {
  const [data, setData] = useState(undefined);
  const [status, setStatus] = useState('Loading your connections…');

  useEffect(() => {
    void loadConnections();
  }, [apiBaseUrl]);

  async function loadConnections() {
    if (!apiBaseUrl) {
      setStatus('Connections are not available in this deployment yet.');
      return;
    }

    try {
      const session = readStoredBrowserAuthSession(window.localStorage);
      if (!session) {
        setStatus('Sign in to manage your connections.');
        return;
      }
      const [summary, friends, incoming, outgoing, blocks] = await Promise.all([
        requestJson('/api/v1/relationships/summary', session),
        requestJson('/api/v1/relationships/friends', session),
        requestJson('/api/v1/relationships/friend-requests/incoming', session),
        requestJson('/api/v1/relationships/friend-requests/outgoing', session),
        requestJson('/api/v1/relationships/blocks', session)
      ]);
      setData({
        blocks: readRelationshipPage(blocks, 'blockedAuthUserId'),
        friends: readRelationshipPage(friends, 'friendAuthUserId'),
        incoming: readRelationshipPage(incoming, 'targetAuthUserId'),
        outgoing: readRelationshipPage(outgoing, 'targetAuthUserId'),
        summary: readRelationshipSummary(summary)
      });
      setStatus('Your connection lists are up to date.');
    } catch (error) {
      setData(undefined);
      setStatus(statusForError(error));
    }
  }

  async function requestJson(pathname, session) {
    const request = createMsUserRelationsRequest({ apiBaseUrl, method: 'GET', pathname, session });
    const response = await fetch(request.url, request.init);
    if (!response.ok) throw new ProfileSocialApiError(response.status >= 500 ? 'unavailable' : 'rejected');
    return response.json();
  }

  async function runCommand(method, pathname, body = undefined) {
    if (!apiBaseUrl) return;
    try {
      const session = readStoredBrowserAuthSession(window.localStorage);
      if (!session) throw new ProfileSocialApiError('rejected');
      const request = createMsUserRelationsRequest({ apiBaseUrl, body, method, pathname, session });
      const response = await fetch(request.url, request.init);
      if (!response.ok) throw new ProfileSocialApiError(response.status >= 500 ? 'unavailable' : 'rejected');
      setStatus('Your connection change has been applied.');
      await loadConnections();
    } catch (error) {
      setStatus(statusForError(error));
    }
  }

  function handleNewConnection(event) {
    event.preventDefault();
    const targetAuthUserId = String(new FormData(event.currentTarget).get('targetAuthUserId') ?? '').trim();
    const action = String(new FormData(event.currentTarget).get('action') ?? 'friend');
    if (!/^[A-Za-z0-9._~-]+$/.test(targetAuthUserId)) {
      setStatus('Enter a valid opaque account ID.');
      return;
    }
    void runCommand(
      'POST',
      action === 'block' ? '/api/v1/relationships/blocks' : '/api/v1/relationships/friend-requests',
      { targetAuthUserId }
    );
  }

  return (
    <section className="relationship-panel" aria-labelledby="connections-heading">
      <h1 id="connections-heading">Connections</h1>
      <p>Manage friendships and blocks using an account ID shared with you. Public profiles do not reveal these IDs.</p>
      <p aria-live="polite">{status}</p>
      <form onSubmit={handleNewConnection}>
        <label htmlFor="connection-account-id">Account ID</label>
        <input id="connection-account-id" name="targetAuthUserId" maxLength="128" required />
        <label htmlFor="connection-action">Action</label>
        <select id="connection-action" name="action" defaultValue="friend">
          <option value="friend">Send friend request</option>
          <option value="block">Block account</option>
        </select>
        <button type="submit">Apply</button>
      </form>
      {data && <RelationshipLists data={data} onCommand={runCommand} />}
    </section>
  );
}

function RelationshipLists({ data, onCommand }) {
  return <>
    <dl className="relationship-summary">
      <div><dt>Friends</dt><dd>{data.summary.visibleFriendCount}</dd></div>
      <div><dt>Incoming requests</dt><dd>{data.summary.incomingPendingCount}</dd></div>
      <div><dt>Outgoing requests</dt><dd>{data.summary.outgoingPendingCount}</dd></div>
      <div><dt>Blocked accounts</dt><dd>{data.summary.activeBlockCount}</dd></div>
    </dl>
    <RelationshipList title="Friends" entries={data.friends} actionLabel="Remove" onAction={(id) => onCommand('DELETE', `/api/v1/relationships/friends/${encodeURIComponent(id)}`)} />
    <IncomingRequestList entries={data.incoming} onCommand={onCommand} />
    <RelationshipList title="Outgoing requests" entries={data.outgoing} actionLabel="Cancel" onAction={(id) => onCommand('DELETE', `/api/v1/relationships/friend-requests/${encodeURIComponent(id)}`)} />
    <RelationshipList title="Blocked accounts" entries={data.blocks} actionLabel="Unblock" onAction={(id) => onCommand('DELETE', `/api/v1/relationships/blocks/${encodeURIComponent(id)}`)} />
  </>;
}

function IncomingRequestList({ entries, onCommand }) {
  return <section aria-labelledby="relationship-incoming-requests">
    <h2 id="relationship-incoming-requests">Incoming requests</h2>
    {entries.length === 0 ? <p>None.</p> : <ul>{entries.map((entry) => <li key={entry.id}>
      <code>{entry.id}</code>{' '}
      <button type="button" onClick={() => onCommand('POST', `/api/v1/relationships/friend-requests/${encodeURIComponent(entry.id)}/respond`, { action: 'accept' })}>Accept</button>{' '}
      <button type="button" onClick={() => onCommand('POST', `/api/v1/relationships/friend-requests/${encodeURIComponent(entry.id)}/respond`, { action: 'decline' })}>Decline</button>
    </li>)}</ul>}
  </section>;
}

function RelationshipList({ title, entries, actionLabel, onAction }) {
  return <section aria-labelledby={`relationship-${title.replaceAll(' ', '-').toLowerCase()}`}>
    <h2 id={`relationship-${title.replaceAll(' ', '-').toLowerCase()}`}>{title}</h2>
    {entries.length === 0 ? <p>None.</p> : <ul>{entries.map((entry) => <li key={entry.id}><code>{entry.id}</code> <button type="button" onClick={() => onAction(entry.id)}>{actionLabel}</button></li>)}</ul>}
  </section>;
}

function statusForError(error) {
  if (error instanceof ProfileSocialApiError && error.kind === 'rejected') return 'Your sign-in has ended or this change is not available.';
  return 'Connections are not available right now. Please try again later.';
}

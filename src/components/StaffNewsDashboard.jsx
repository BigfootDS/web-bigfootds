import { useEffect, useState } from 'react';

import { BrowserAuthSessionError } from '../lib/browser-auth-session.mjs';
import { EmailVerificationRequiredNotice, useEmailVerificationRecovery } from './EmailVerificationRecovery.jsx';
import {
  EditorialNewsApiError,
  createEditorialNewsListRequest,
  readEditorialNewsListResponse
} from '../lib/editorial-news-api.mjs';
import '../styles/staff-news.css';

/**
 * Lists the currently selected locale's MS-News editorial records for staff.
 *
 * This static page contains no post data at build time. It verifies the stored
 * direct-client session before each MS-News request and renders only safe,
 * generic errors when MS-Auth refuses the caller or a service is unavailable.
 */
export default function StaffNewsDashboard({ apiBaseUrl, authBaseUrl }) {
  const [page, setPage] = useState(undefined);
  const [phase, setPhase] = useState('loading');
  const [status, setStatus] = useState('Checking staff access…');
  const { requiresVerification, verifySession } = useEmailVerificationRecovery();
  const [locale, setLocale] = useState('en-AU');
  const [lifecycle, setLifecycle] = useState('');

  useEffect(() => {
    void loadFirstPage();
  }, [apiBaseUrl, authBaseUrl, locale, lifecycle]);

  async function loadFirstPage() {
    setPage(undefined);
    if (!apiBaseUrl || !authBaseUrl) {
      setPhase('unavailable');
      setStatus('News administration is not available in this deployment yet.');
      return;
    }

    setPhase('loading');
    setStatus('Loading News records…');
    try {
      const response = await requestWithCurrentSession((session) => createEditorialNewsListRequest({
        apiBaseUrl,
        limit: 20,
        locale,
        session,
        ...(lifecycle === '' ? {} : { status: lifecycle })
      }));
      const nextPage = await readEditorialNewsListResponse(response);
      setPage(nextPage);
      setPhase('ready');
      setStatus(nextPage.results.length === 0 ? 'No News records match these filters.' : 'Choose a record to edit, or start a draft.');
    } catch (error) {
      setPhase(isSignInRejection(error) ? 'signed-out' : 'unavailable');
      setStatus(statusForError(error));
    }
  }

  async function requestWithCurrentSession(createRequest) {
    const session = await verifySession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
    if (!session) throw new EditorialNewsApiError('rejected');
    let request = createRequest(session);
    let response = await fetch(request.url, request.init);
    if (response.status !== 401 && response.status !== 403) return response;

    const renewed = await verifySession({ apiBaseUrl: authBaseUrl, storage: window.localStorage });
    if (!renewed) return response;
    request = createRequest(renewed);
    return await fetch(request.url, request.init);
  }

  if (requiresVerification) return <EmailVerificationRequiredNotice />;

  if (phase === 'loading' || phase === 'signed-out' || phase === 'unavailable') {
    return <p aria-live="polite">{status}</p>;
  }

  return (
    <section className="staff-news" aria-labelledby="staff-news-dashboard-heading">
      <div className="staff-news__heading-row">
        <div>
          <h1 id="staff-news-dashboard-heading">News administration</h1>
          <p>Draft, schedule, publish, and unpublish website News. This workspace is for staff only.</p>
        </div>
        <a className="staff-news__primary-action" href="/admin/news/editor/">New draft</a>
      </div>

      <form className="staff-news__filters" onSubmit={(event) => { event.preventDefault(); void loadFirstPage(); }}>
        <label>
          Locale
          <input value={locale} onChange={(event) => setLocale(event.target.value)} pattern="[a-z]{2,3}(-[A-Z]{2})?" required />
        </label>
        <label>
          Lifecycle
          <select value={lifecycle} onChange={(event) => setLifecycle(event.target.value)}>
            <option value="">All non-counted records</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <button type="submit">Refresh</button>
      </form>

      <p aria-live="polite">{status}</p>
      <ul className="staff-news__record-list">
        {page.results.map((record) => (
          <li key={record.id}>
            <article>
              <p><span className="staff-news__status">{record.status}</span> · {record.projectId} · updated {formatDate(record.updatedAt)}</p>
              <h2><a href={`/admin/news/editor/?id=${encodeURIComponent(record.id)}&locale=${encodeURIComponent(record.locale)}`}>{record.title}</a></h2>
              <p>{record.summary}</p>
              <p className="staff-news__meta">{record.category} · {record.tags.map((tag) => `#${tag}`).join(' ') || 'No tags'}</p>
            </article>
          </li>
        ))}
      </ul>
      {page.nextCursor && <p>This list has more records. Refine a lifecycle filter before continuing the editorial review.</p>}
    </section>
  );
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function statusForError(error) {
  if (isSignInRejection(error)) return 'Your staff sign-in has ended. Please sign in again.';
  if (error instanceof EditorialNewsApiError && error.kind === 'invalid-response') return 'News administration received an unsafe response and cannot show it.';
  return 'News administration is not available right now. Please try again later.';
}

function isSignInRejection(error) {
  return (error instanceof BrowserAuthSessionError && ['rejected', 'verification-required'].includes(error.kind))
    || (error instanceof EditorialNewsApiError && error.kind === 'rejected');
}

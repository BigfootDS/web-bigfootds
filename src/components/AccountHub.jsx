import { useCallback, useState } from 'react';

import AccountProfilePanel from './AccountProfilePanel.jsx';
import BrowserAuthSessionPanel from './BrowserAuthSessionPanel.jsx';
import '../styles/account-hub.css';

/**
 * Composes the two services that make up a visitor's self-management screen.
 *
 * MS-Auth still owns credentials and MS-Accounts still owns profile fields.
 * The local revision counter gives the profile panel a reason to re-check its
 * own authenticated API after a sign-in or local sign-out, without exposing
 * session material to the hub or altering either service's token contract.
 *
 * @param {{ accountsBaseUrl?: string, authBaseUrl?: string }} props Public build-time service origins.
 * @returns {import('react').ReactNode} Account management screen.
 */
export default function AccountHub({ accountsBaseUrl, authBaseUrl }) {
  const [sessionRevision, setSessionRevision] = useState(0);
  const handleSessionChange = useCallback(() => setSessionRevision((revision) => revision + 1), []);

  return (
    <section className="account-hub" aria-labelledby="account-hub-heading">
      <header>
        <h1 id="account-hub-heading">Your account</h1>
        <p>Manage your sign-in and the details people can see about you in one place.</p>
      </header>
      <div className="account-hub-panels">
        <BrowserAuthSessionPanel apiBaseUrl={authBaseUrl} onSessionChange={handleSessionChange} />
        <AccountProfilePanel
          apiBaseUrl={accountsBaseUrl}
          authBaseUrl={authBaseUrl}
          headingLevel={2}
          sessionRevision={sessionRevision}
        />
      </div>
    </section>
  );
}

/**
 * Defines the small, stable public navigation for the current website phase.
 *
 * Routes such as public Events, public profile lookup and staff News editing
 * remain reachable when a person has a direct reason to use them, but they do
 * not compete with the core journeys in the site-wide header.
 *
 * @type {readonly { href: string, label: string }[]}
 */
export const PRIMARY_NAVIGATION_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/news', label: 'News' },
  { href: '/projects', label: 'Projects' },
  { href: '/account', label: 'Accounts' }
];

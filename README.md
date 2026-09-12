# BigfootDS Website

HTML, CSS, JS, and other files relevant to the BigfootDS website.

This is currently deployed to:

- [bigfootds.com](https://bigfootds.com/)

## Purpose

Purpose of the repo: education!

Purpose of the web-app: business!

I need a web client for the back-ends that I'm building so that my customers (of my videogames) can do appropriate things with their user data and game data.

Building this as a classroom example / optional extra-curricular example project means that:

1. I can create time to work on this thing.
2. I can show students some cool functionalities and ways of working.

The repository of this front-end web-app is publicly visible since it holds no API keys or other sensitive data - the back-end servers / microservices will remain private though, as they do have keys and security logic that would become useless if it were public. White-label projects of the back-ends will be made during classes, it's really not special - but things like the JWT decryption keys cannot be shared.

## Core website journeys

The primary header keeps the current public journeys compact: Home, About, News, Projects and Accounts. Home uses the generated public MS-News snapshot to feature up to three latest published posts, then features up to three currently published project pages. If a build contains no public News, it omits that section instead of using placeholder content.

`/projects/` is a static directory rather than a service-backed catalogue. It supports literal title-and-description search, the existing Available now/Coming soon split (derived only from the optional project publication date), and newest, oldest or title sorting. Its state is shareable through `q`, `availability`, and `sort` query parameters. The directory intentionally does not claim technology, brand, platform or richer project-status metadata until those fields exist in the content source.

Public Events and public profile lookup remain available from their direct URLs, while staff News administration remains unlinked from public navigation. Forum work is deliberately deferred until MS-Forum has a separately approved runnable service contract.

## Browser account sessions

`/account/` is the direct-client account-management screen. It brings the MS-Auth sign-in controls and the MS-Accounts self-profile editor together without merging their responsibilities. On a successful sign-in it retains only the returned access-token and refresh-token pair in the visitor's `localStorage`; the password, email, raw service errors, and tokens do not belong in the URL, static output, rendered HTML, analytics, or browser-visible error copy. Sign-out removes the local pair only. MS-Auth remains responsible for the persisted refresh-token state, while MS-Accounts remains responsible for profile data.

This follows the selected BigfootDS client model, not a cookie or session-broker model. Browser storage is readable by same-origin JavaScript, so an XSS defect has a larger impact than with an HttpOnly cookie. Keep authenticated surfaces free of unreviewed third-party scripts, and follow the [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html) when extending this boundary. The static GitHub Pages deployment cannot presently configure response security headers, so a reviewed edge or hosting-level Content Security Policy remains a required hardening follow-up. Do not add a permissive meta policy as a substitute.

The account island does not attempt the current OAuth flow. Its existing redirect transport places an access token in an OAuth `state` query value, which conflicts with this website's no-token-in-URL rule. A separate reviewed OAuth redesign is required before an OAuth callback is added here.

For local testing, set the non-secret public browser value to a bare HTTPS origin, or a loopback HTTP origin:

```powershell
$env:PUBLIC_MS_AUTH_BASE_URL = 'http://localhost:3000'
npm run dev
```

The production value derives from the existing canonical GitHub organisation variable `MS_AUTH_BASE_URL`; do not create a second unrelated base-URL variable. The Pages workflow maps it to Astro's public `PUBLIC_MS_AUTH_BASE_URL` build value. MS-Auth still needs the exact deployment value `CORS_ALLOWED_ORIGINS=https://bigfootds.com` before a browser request can succeed. Use the exact HTTPS origin, no wildcard, path, or trailing route. The browser requests omit cookies, disable caching, and use [a no-referrer policy](https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/Referrer_policy).

At this foundation stage, the browser sends a token pair only to MS-Auth:

| Action | Request contract |
| --- | --- |
| Sign in | `POST /v1/users/public/login` with JSON email and password; MS-Auth returns the token pair. |
| Verify or renew | `GET /v1/users/protected/verify` with `accessToken` and `refreshToken` headers. A renewed access token preserves the existing refresh token if MS-Auth omits one. |

Do not reuse those header names blindly for another microservice. Each future authenticated browser feature must document and test that service's pair transport before it makes a request. Public news and Events remain anonymous and fully usable without a session.

## Profiles and connections

`/profiles/?name=Display%20Name` looks up the public-safe profile returned by MS-Accounts. It sends no token and never receives an MS-Auth user ID, private social link, relationship state, or staff data. The result is deliberately query-addressable because this static host cannot generate an unbounded route for every future display name.

`/account/profile/` remains a compatibility URL and immediately directs visitors to `/account/`; it is not a separate primary journey. The self-profile editor sends the selected access token as `Authorization: Bearer`, `accessToken`, and sends `refreshToken` alongside it. MS-Accounts retains its established bearer validation and does not persist or forward the browser refresh token. The editor submits only MS-Accounts' editable fields: display name, biography, nameplate, profile-picture layer URLs, tag, and the complete visibility-aware social-link collection.

`/account/connections/` is separate because relationships are owned by MS-UserRelations, not profile data. Its requests send the pair in `accessToken` and `refreshToken` headers, without a client `Authorization` header; that service derives the caller through its MS-Auth introspection boundary. The existing relationship API exposes opaque account IDs only. Public profile data intentionally cannot map a display name to such an ID, so friend and block actions require an account ID shared through another agreed product flow. The website does not infer a relationship from a profile or expose a public friends list.

These browser routes fail closed as unavailable until the Pages workflow maps the existing canonical organisation variables into `PUBLIC_MS_ACCOUNTS_BASE_URL` and `PUBLIC_MS_USERRELATIONS_BASE_URL`. They are Astro build details, not new organisation variables. Before release, set each deployed service's exact `CORS_ALLOWED_ORIGINS` to `https://bigfootds.com`: MS-Accounts needs its separately approved CD environment mapping added, while MS-UserRelations already supports that variable. Keep MS-Auth's exact origin configuration in place as well. All three browser callers omit cookies, use `no-store`, and apply a no-referrer policy.

## Build Your Own

This project is based on the "Astro Starter Kit: Blog" project template. Make your own with this command in your NodeJS-ready terminal:

```sh
npm create astro@latest -- --template blog
```

## Local development requirements

The current Astro 7 toolchain requires Node.js 22.12 or newer and npm 9.6.5 or newer. The deployment workflow uses the current Node LTS release, so use a matching or newer local runtime before installing dependencies.

Start from the lockfile with `npm ci`. Then run `npm test` for the Node and component suites. `npm run build` needs the documented non-secret public service origins because it refreshes the News and Event snapshots before generating static pages.

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

This project does have a few other things added to it beyond the basic blog template, but you can compare the differences yourself as part of your education. Things like `package.json` and any config files will be very worthwhile to dig into! 😉

## Public news publishing

MS-News remains the editorial source of truth. This website turns its public, locale-selected list response into an ignored build-time snapshot, then uses that snapshot to generate static `/news/` pages. The public News experience has no browser credentials. The separate staff News composer below makes direct, attested browser requests and never has a service token.

Set the non-secret GitHub organisation or repository variable `MS_NEWS_BASE_URL` to the bare public MS-News HTTP(S) origin. Do not include a path, query, fragment, or credentials. The Pages workflow uses that one canonical value for both the server-side snapshot sync and Astro's `PUBLIC_MS_NEWS_BASE_URL` staff-composer build value. It is not a second GitHub variable. For local work, set the same environment variable before running:

```powershell
npm run news:sync
npm run build
```

`npm run build` runs the sync first and fails with an actionable message when the variable is missing. The sync requests only `GET /api/v1/news` with `locale=en-AU` and a page size of 50, follows opaque cursors, validates the public DTO, and atomically replaces `src/generated/public-news.json`. That ignored file is not canonical content. A post that was unpublished or expired in MS-News is removed only after the next successful refresh and deployment. A static site cannot revoke an already deployed page immediately.

The build request is server-to-server, so MS-News does not need a browser CORS origin for this particular path. Keep `CORS_ALLOWED_ORIGINS` limited to actual browser callers. If a later approved feature adds browser API calls, add the exact website origin to that service's deployment configuration at that time.

### Rich articles and media

The snapshot accepts either a legacy plain-text body or MS-News’ bounded `tiptap-json-v1` document format. The website validates that document independently before rendering it: it permits only the documented headings, paragraphs, lists, quotes, horizontal rules, text marks, verified image references, image galleries, and YouTube video IDs. It does not interpret article HTML, arbitrary image URLs, base64 data, or arbitrary embeds.

Images resolve through MS-News’ public `/api/v1/news/media/{assetId}` delivery route, never a bucket URL stored in a document. The service checks that the opaque asset is still referenced by a currently visible post before creating a short-lived Cloud Storage redirect. A single image remains an ordinary link; galleries work without JavaScript as image links and then enhance into a keyboard-accessible lightbox with thumbnails, zoom, and fullscreen controls. YouTube embeds use the privacy-enhanced `youtube-nocookie.com` host and a validated video ID.

Existing Markdown and MDX files under `src/content/blog/` remain available on their legacy slug routes while historical content is migrated. They are not an alternate authoring path for new MS-News posts. The staff editor saves new structured documents and uploads images through authenticated MS-News editorial routes. Its Cloud Storage bucket, IAM, CORS, and service environment configuration are operational work, not something created by this static website build.

### Staff News administration

`/admin/news/` is the staff list and `/admin/news/editor/` is the WYSIWYG composer. They are deliberately not linked in the public header or News pages. Both routes are static shells, so they are not the authorisation boundary. The shell immediately verifies the token pair in browser storage with MS-Auth, then MS-News asks MS-Auth to attest the human bearer token for every list, read, edit, publication, and media request. A visitor without a current staff session receives no draft content, metadata, upload intent, or media capability.

The composer uses Tiptap for normal text editing, but it serialises only the small MS-News document format. That means headings, paragraphs, lists, quotes, links, rules, verified images, ordered image galleries, and YouTube IDs are supported. Raw HTML, MDX, arbitrary iframes, arbitrary image URLs, base64 content, and browser-authored publication state are not. MS-News remains the source of truth for drafts, publication status, media readiness, and immutable staff audit history.

Browser editorial requests use `Authorization: Bearer <access token>`, `accessToken`, and `refreshToken` headers with cookies omitted, no-store caching, and a no-referrer policy. The component verifies first and retries one request after an MS-News `401` or `403`, so a renewable browser session does not interrupt an editor. The staff media-preview request is the deliberate exception: it sends only `Authorization` because MS-News redirects it to a different Cloud Storage origin. Fetch removes that standard credential on the cross-origin redirect, while custom token-pair headers could otherwise reach or preflight against the bucket. No signed media URL is stored in a post, in browser storage, or in a generated public page.

An image upload has three steps: the staff browser requests one MS-News upload intent, posts the image form directly to the private bucket, then asks MS-News to inspect and finalise it. Only a JPEG, PNG, or WebP image up to 10 MiB can reach that flow. After verification, the browser fetches the attested staff preview route and retains its returned blob URL in memory. The public website uses the separate visibility-gated MS-News media route after a post is published.

Before enabling browser media uploads in a deployed environment, configure the following operational pieces:

1. Create a private Google Cloud Storage bucket with Uniform Bucket-Level Access and Public Access Prevention enabled. Do not grant `allUsers` object access or create a static service-account key.
2. Give the MS-News Cloud Run runtime identity only the bucket object permissions it needs to write, inspect, and read its own `news-media/` objects, plus the identity permission needed to create V4 signed POST and read URLs. Review this against [Cloud Storage signed URL guidance](https://cloud.google.com/storage/docs/access-control/signed-urls).
3. Set the existing non-secret `NEWS_MEDIA_GCS_BUCKET` service environment value and map it through the MS-News Cloud Run deployment. The service should continue to fail closed when that value is absent.
4. Apply a bucket CORS policy for exactly `https://bigfootds.com` (and a deliberately chosen loopback development origin only when needed), allowing `POST` for signed form uploads and `GET` for the short-lived preview read. Do not use `*`, credentials, or broad custom headers. The service itself also needs `CORS_ALLOWED_ORIGINS=https://bigfootds.com` for the editor's MS-News calls.
5. Add a lifecycle rule for unverified staging objects and verify that anonymous bucket listing and reads fail. Then test an attested staff upload, a draft preview, a published image, and an unpublished image separately.

The public News build is still server-to-server and does not need browser CORS. The staff composer does, so keep the two paths distinct when diagnosing a deployment.

### Search and filters

The static news page offers literal, case-insensitive browser search across the published title and summary, plus project, category, and tag filters. Article bodies are intentionally excluded from the discovery payload and remain only on individual static article pages. MS-News can still search public title, summary, and body through its server-side `q` contract for a later approved dynamic consumer.

The browser index fails the build before it exceeds 2,000 posts or 4,000,000 JSON characters. Each indexed item permits a 24-character ID, 100-character project and category, 30-character publication timestamp, up to 50 tags of 100 characters, a 300-character title, and a 2,000-character summary. These limits keep a full news archive from becoming one large browser response.

State is shareable as URL parameters:

```text
/news/?q=release&project=playergamedata&category=announcement&tag=settings
```

The page does not interpret searches as regular expressions or send them to a service. JavaScript applies filters to the already-public build snapshot; without JavaScript, the page still lists the published posts and explains that filtering needs it.

### Deployment refreshes

The Pages workflow runs after a push to `main`, on a manual workflow dispatch, every hour, and after the `news-publication-refresh` repository-dispatch event. The workflow intentionally ignores dispatch payload fields. One shared concurrency group cancels an older refresh when a newer one arrives, so a delayed scheduled build cannot deploy an older snapshot after a newer push or dispatch. The hourly run remains the safety net for scheduled publish and expiry changes while a separate credential decision is needed before MS-News can send a dispatch event. It also refreshes the independently sourced public Event snapshot described below.

Run the deterministic behaviour tests with `npm test`. `npm run astro -- check` runs Astro diagnostics, and `npm run build` performs the sync and static build.

## Public events

LiveOps is an internal staff term, not player-facing website language. The `/events/` page asks MS-LiveOpsConfig for an opt-in list of currently active public events. It never receives generic configuration payloads, configuration keys, revision IDs, content hashes, staff identities, reward schedules, shop rotations, content sets, or browser credentials.

Set the non-secret GitHub organisation or repository variable `MS_LIVEOPSCONFIG_BASE_URL` to the bare public MS-LiveOpsConfig HTTP(S) origin. The Pages workflow supplies that one canonical variable to two build contexts: `MS_LIVEOPSCONFIG_BASE_URL` for the server-side snapshot sync and `PUBLIC_MS_LIVEOPSCONFIG_BASE_URL` for anonymous browser availability checks. The latter is an Astro implementation detail, not a second GitHub variable. For local work, set both variables to a bare `http://localhost:<port>` or `http://127.0.0.1:<port>` origin before building.

The event list stays live in the browser because an active window can start or finish at any UTC instant. Visitors can share a literal title-and-summary search plus project and tag filters in the page URL:

```text
/events/?q=spring&project=thebestestbeehive&tag=event
```

The page sends only anonymous, `no-store` requests with cookies omitted and no referrer. Add `https://bigfootds.com` to the deployed MS-LiveOpsConfig `CORS_ALLOWED_ORIGINS` value when releasing the matching events endpoint. CORS is required for this browser feature, unlike the server-to-server news build. The service remains responsible for returning only bounded, explicitly approved event presentation metadata. Staff-only LiveOps editing belongs to a future authenticated administration surface, never this player route.

### Event detail pages

`/events/{eventId}/` is a player-facing, read-only page generated from the same bounded anonymous Events catalogue. The identifier is an opaque `evt_` value supplied by staff; it does not expose a configuration key, revision ID, content hash, reward data, or staff information. Staff retain that identifier when they create a later immutable revision of the same event, so public links keep working when copy or dates change.

`npm run events:sync` calls only `GET /api/v1/events` with a page size of 50, follows its opaque cursors, rejects unexpected fields and malformed data, and atomically replaces the ignored `src/generated/public-events.json` snapshot. `npm run build` runs both the news and Event syncs first. The static host therefore creates pages for Events active at the latest successful build; a new, changed, or expired event can lag the public API until the next successful hourly deployment. This is a deliberate static-host constraint, not a cache policy.

Each deployed detail page anonymously re-checks `GET /api/v1/events/{eventId}` with `no-store`, omitted cookies, and no referrer. If the service reports `404`, the page hides the previously generated copy and tells the visitor the event is no longer available. If the service cannot be reached, it clearly labels the snapshot's current availability as unconfirmed. It never loads a configuration payload or an admin resource in the browser.

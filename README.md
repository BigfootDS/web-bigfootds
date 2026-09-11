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

## Build Your Own

This project is based on the "Astro Starter Kit: Blog" project template. Make your own with this command in your NodeJS-ready terminal:

```sh
npm create astro@latest -- --template blog
```

Features:

- ✅ Minimal styling (make it your own!)
- ✅ 100/100 Lighthouse performance
- ✅ SEO-friendly with canonical URLs and OpenGraph data
- ✅ Sitemap support
- ✅ RSS Feed support
- ✅ Markdown & MDX support

This project does have a few other things added to it beyond the basic blog template, but you can compare the differences yourself as part of your education. Things like `package.json` and any config files will be very worthwhile to dig into! 😉

## Public news publishing

MS-News remains the editorial source of truth. This website turns its public, locale-selected list response into an ignored build-time snapshot, then uses that snapshot to generate static `/news/` pages. Nothing in this repository stores a service token, calls an editorial route, or sends an API request from a visitor's browser.

Set the non-secret GitHub Actions repository variable `MS_NEWS_PUBLIC_API_BASE_URL` to the bare public MS-News HTTP(S) origin. Do not include a path, query, fragment, or credentials. For local work, set the same environment variable before running:

```powershell
npm run news:sync
npm run build
```

`npm run build` runs the sync first and fails with an actionable message when the variable is missing. The sync requests only `GET /api/v1/news` with `locale=en-AU` and a page size of 50, follows opaque cursors, validates the public DTO, and atomically replaces `src/generated/public-news.json`. That ignored file is not canonical content. A post that was unpublished or expired in MS-News is removed only after the next successful refresh and deployment. A static site cannot revoke an already deployed page immediately.

The build request is server-to-server, so MS-News does not need a browser CORS origin for this particular path. Keep `CORS_ALLOWED_ORIGINS` limited to actual browser callers. If a later approved feature adds browser API calls, add the exact website origin to that service's deployment configuration at that time.

### Search and filters

The static news page offers literal, case-insensitive browser search across the published title and summary, plus project, category, and tag filters. Article bodies are intentionally excluded from the discovery payload and remain only on individual static article pages. MS-News can still search public title, summary, and body through its server-side `q` contract for a later approved dynamic consumer.

The browser index fails the build before it exceeds 2,000 posts or 4,000,000 JSON characters. Each indexed item permits a 24-character ID, 100-character project and category, 30-character publication timestamp, up to 50 tags of 100 characters, a 300-character title, and a 2,000-character summary. These limits keep a full news archive from becoming one large browser response.

State is shareable as URL parameters:

```text
/news/?q=release&project=playergamedata&category=announcement&tag=settings
```

The page does not interpret searches as regular expressions or send them to a service. JavaScript applies filters to the already-public build snapshot; without JavaScript, the page still lists the published posts and explains that filtering needs it.

### Deployment refreshes

The Pages workflow runs after a push to `main`, on a manual workflow dispatch, every hour, and after the `news-publication-refresh` repository-dispatch event. The workflow intentionally ignores dispatch payload fields. One shared concurrency group cancels an older refresh when a newer one arrives, so a delayed scheduled build cannot deploy an older snapshot after a newer push or dispatch. The hourly run remains the safety net for scheduled publish and expiry changes while a separate credential decision is needed before MS-News can send a dispatch event.

Run the deterministic behaviour tests with `npm test`. `npm run astro -- check` runs Astro diagnostics, and `npm run build` performs the sync and static build.

## Public Live Ops catalogue

Live Ops configuration is not automatically public just because a game can read it. The `/live-ops/` page asks MS-LiveOpsConfig for an opt-in catalogue of currently active, visitor-facing summaries. It never receives a generic configuration payload, configuration key, revision ID, content hash, staff identity, or browser credential.

Set the non-secret public deployment variable `PUBLIC_LIVEOPS_CONFIG_BASE_URL` to the bare public MS-LiveOpsConfig HTTP(S) origin. The page makes no request when that value is absent, then shows a simple unavailable state instead of guessing a service URL. For local work, a bare `http://localhost:<port>` or `http://127.0.0.1:<port>` origin is also allowed.

The catalogue stays live in the browser because an active window can start or finish at any UTC instant. Visitors can share a literal title-and-summary search plus project, content-type, and tag filters in the page URL:

```text
/live-ops/?q=spring&project=thebestestbeehive&type=event_schedule&tag=event
```

The page sends only anonymous, `no-store` requests with cookies omitted and no referrer. Add `https://bigfootds.com` to the deployed MS-LiveOpsConfig `CORS_ALLOWED_ORIGINS` value when releasing the matching catalogue endpoint. CORS is required for this browser feature, unlike the server-to-server news build. The service remains responsible for returning only bounded, explicitly approved public presentation metadata.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const articles = [
  ['2024-12-29-website-overhaul', '6abc9266f576bac82f5f8fe3', '2024-12-29', 'Website Overhaul'],
  ['2024-12-31-2024-year-in-review', '6abc934df576bac82f5f8fe5', '2024-12-31', '2024 Year In Review'],
  ['2025-12-31-2025-year-in-review', '6abc93e9f576bac82f5f8fe6', '2025-12-31', '2025 Year In Review']
];
const posts = articles.map(([, id, date, title]) => ({ id, projectId: 'web-bigfootds',
  category: 'news', tags: ['news'], publishAt: `${date}T12:00:00.000Z`,
  content: { locale: 'en-AU', title, summary: 'Fixture & summary', body: 'Public fixture article.' } }));

// Only public build reads are implemented. An accidental build-time account or
// editorial request fails rather than reaching any real service or provider.
const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  response.setHeader('Content-Type', 'application/json');
  if (request.url?.startsWith('/api/v1/news?')) {
    response.end(JSON.stringify({ results: posts, pagination: {} }));
  } else if (request.url?.startsWith('/api/v1/events?')) {
    response.end(JSON.stringify({ items: [] }));
  } else {
    response.statusCode = 404;
    response.end('{}');
  }
});

await new Promise((resolveListening, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolveListening);
});

try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  // npm_execpath is supplied by `npm run test:build`; the fallback supports
  // direct invocation on the bundled Node/npm installation as well.
  const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const environment = { ...process.env, NODE_ENV: 'production', MS_NEWS_BASE_URL: origin, MS_LIVEOPSCONFIG_BASE_URL: origin };
  for (const service of ['AUTH', 'ACCOUNTS', 'USERRELATIONS', 'NEWS', 'LIVEOPSCONFIG']) {
    environment[`PUBLIC_MS_${service}_BASE_URL`] = origin;
  }
  const build = spawn(process.execPath, [npmCli, 'run', 'build'], { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  build.stdout.on('data', (chunk) => { output += chunk; });
  build.stderr.on('data', (chunk) => { output += chunk; });
  const exitCode = await new Promise((resolveExit, reject) => { build.once('error', reject); build.once('close', resolveExit); });
  assert.equal(exitCode, 0, `Fixture build failed:\n${output.slice(-12_000)}`);
  const feed = await readFile(resolve(root, 'dist/rss.xml'), 'utf8');
  for (const [slug, id] of articles) {
    const redirect = await readFile(resolve(root, `dist/news/${slug}/index.html`), 'utf8');
    const article = await readFile(resolve(root, `dist/news/${id}/index.html`), 'utf8');
    assert.ok(redirect.includes(`content="0; url=/news/${id}/"`), `Missing redirect for ${slug}`);
    assert.ok(redirect.includes(`href="https://bigfootds.com/news/${id}/"`), `Missing canonical for ${slug}`);
    assert.ok(redirect.includes('noindex, follow'));
    assert.ok(!redirect.includes('Public fixture article.'), 'A legacy route retained article content');
    assert.ok(article.includes('Public fixture article.'));
    assert.ok(feed.includes(`/news/${id}/`));
    assert.ok(!feed.includes(`/news/${slug}/`));
  }
  assert.ok(feed.includes('Fixture &amp; summary'));
  for (const route of ['register', 'verify-email']) {
    const html = await readFile(resolve(root, `dist/account/${route}/index.html`), 'utf8');
    assert.ok(html.includes('<noscript>'));
    assert.ok(!html.includes('type="password"') && !html.includes('name="code"'), 'An onboarding form was prerendered');
  }
  assert.equal(requests.length, 2, 'The build requested an unexpected service path');
  console.log('Fixture build passed: three canonical articles, three legacy redirects, canonical RSS and two client-only onboarding pages.');
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

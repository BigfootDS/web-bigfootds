import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/cd.yml', import.meta.url);

test('maps canonical service origins into the correct website build environments', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /MS_NEWS_BASE_URL: \$\{\{ vars\.MS_NEWS_BASE_URL \}\}/);
  assert.match(workflow, /PUBLIC_MS_NEWS_BASE_URL: \$\{\{ vars\.MS_NEWS_BASE_URL \}\}/);
  assert.match(workflow, /PUBLIC_MS_AUTH_BASE_URL: \$\{\{ vars\.MS_AUTH_BASE_URL \}\}/);
  assert.match(workflow, /PUBLIC_MS_ACCOUNTS_BASE_URL: \$\{\{ vars\.MS_ACCOUNTS_BASE_URL \}\}/);
  assert.match(workflow, /PUBLIC_MS_USERRELATIONS_BASE_URL: \$\{\{ vars\.MS_USERRELATIONS_BASE_URL \}\}/);
  assert.match(workflow, /MS_LIVEOPSCONFIG_BASE_URL: \$\{\{ vars\.MS_LIVEOPSCONFIG_BASE_URL \}\}/);
  assert.match(workflow, /PUBLIC_MS_LIVEOPSCONFIG_BASE_URL: \$\{\{ vars\.MS_LIVEOPSCONFIG_BASE_URL \}\}/);
  assert.doesNotMatch(workflow, /MS_NEWS_PUBLIC_API_BASE_URL|PUBLIC_EVENTS_API_BASE_URL/);
});

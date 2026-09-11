import { fileURLToPath } from 'node:url';

import {
  NEWS_API_BASE_URL_ENVIRONMENT_VARIABLE,
  fetchPublicNews,
  writePublicNewsSnapshot
} from './news-publication.mjs';

const outputPath = fileURLToPath(new URL('../src/generated/public-news.json', import.meta.url));

try {
  const snapshot = await fetchPublicNews({
    apiBaseUrl: process.env[NEWS_API_BASE_URL_ENVIRONMENT_VARIABLE]
  });

  await writePublicNewsSnapshot(outputPath, snapshot);
  console.log(`Generated ${snapshot.posts.length} public ${snapshot.locale} news post(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

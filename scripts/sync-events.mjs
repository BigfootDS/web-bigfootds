import { fileURLToPath } from 'node:url';

import {
  EVENTS_API_BASE_URL_ENVIRONMENT_VARIABLE,
  fetchPublicEvents,
  writePublicEventsSnapshot
} from './events-publication.mjs';

const outputPath = fileURLToPath(new URL('../src/generated/public-events.json', import.meta.url));

try {
  const snapshot = await fetchPublicEvents({
    apiBaseUrl: process.env[EVENTS_API_BASE_URL_ENVIRONMENT_VARIABLE]
  });

  await writePublicEventsSnapshot(outputPath, snapshot);
  console.log(`Generated ${snapshot.events.length} public Event page record(s).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

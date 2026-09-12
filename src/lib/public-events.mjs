import { resolve } from 'node:path';

import { readPublicEventsSnapshot } from '../../scripts/events-publication.mjs';

const snapshotPath = resolve(process.cwd(), 'src/generated/public-events.json');

/**
 * Loads the generated anonymous Event snapshot for Astro's static routes.
 * This runs only at build time: it has no browser-held credential and does
 * not turn an Event URL into a direct configuration or staff API request.
 *
 * @returns {Promise<readonly import('../../scripts/events-publication.mjs').PublicEvent[]>} Deterministically ordered public Events.
 */
export async function getGeneratedPublicEvents() {
  const snapshot = await readPublicEventsSnapshot(snapshotPath);
  return snapshot.events;
}

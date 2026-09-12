import {
  createEventDetailUrl,
  createPublicLiveOpsRequestInit,
  readPublicLiveOpsEvent
} from './liveops-discovery.mjs';

/**
 * Confirms whether a generated player Event page is still currently public.
 *
 * A `404` is authoritative for an expired, unpublished, or removed Event and
 * lets the page hide stale copy. Transport, configuration, and malformed-data
 * failures are deliberately only `unconfirmed`: a static site must not claim
 * that an Event ended merely because its availability check could not run.
 *
 * @param {{ apiBaseUrl: string | undefined, eventId: string, fetchImpl?: typeof fetch, signal?: AbortSignal }} options - Anonymous public Event request settings.
 * @returns {Promise<'available' | 'unavailable' | 'unconfirmed'>} Current safe availability state.
 */
export async function resolvePublicEventAvailability(options) {
  try {
    const response = await (options.fetchImpl ?? fetch)(
      createEventDetailUrl(options.apiBaseUrl, options.eventId),
      createPublicLiveOpsRequestInit(options.signal)
    );

    if (response.status === 404) return 'unavailable';
    if (!response.ok) return 'unconfirmed';

    const event = readPublicLiveOpsEvent(await response.json());
    return event.id === options.eventId ? 'available' : 'unconfirmed';
  } catch {
    return 'unconfirmed';
  }
}

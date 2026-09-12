import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePublicEventAvailability } from '../src/lib/event-detail-availability.mjs';

const eventId = 'evt_0123456789abcdef0123456789abcdef';

function publicEvent(overrides = {}) {
  return {
    id: eventId,
    projectId: 'thebestestbeehive',
    startsAt: '2026-09-12T00:00:00.000Z',
    summary: 'A public Event detail.',
    tags: ['event'],
    title: 'Public Event',
    ...overrides
  };
}

test('treats an Event detail 404 as authoritative unavailability', async () => {
  const availability = await resolvePublicEventAvailability({
    apiBaseUrl: 'https://liveops.example.test',
    eventId,
    fetchImpl: async () => new Response('', { status: 404 })
  });

  assert.equal(availability, 'unavailable');
});

test('accepts only a matching, documented current Event response', async () => {
  let requestedUrl;
  let requestOptions;
  const availability = await resolvePublicEventAvailability({
    apiBaseUrl: 'https://liveops.example.test',
    eventId,
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestOptions = options;
      return new Response(JSON.stringify({ event: publicEvent() }), { status: 200 });
    }
  });

  assert.equal(availability, 'available');
  assert.equal(requestedUrl.toString(), `https://liveops.example.test/api/v1/events/${eventId}`);
  assert.equal(requestOptions.credentials, 'omit');
  assert.equal(requestOptions.cache, 'no-store');
  assert.equal(requestOptions.referrerPolicy, 'no-referrer');
});

test('keeps generated copy marked unconfirmed when current availability cannot be safely verified', async () => {
  assert.equal(await resolvePublicEventAvailability({
    apiBaseUrl: undefined,
    eventId
  }), 'unconfirmed');
  assert.equal(await resolvePublicEventAvailability({
    apiBaseUrl: 'https://liveops.example.test',
    eventId,
    fetchImpl: async () => new Response(JSON.stringify({ event: publicEvent({ id: 'evt_fedcba9876543210fedcba9876543210' }) }), { status: 200 })
  }), 'unconfirmed');
});

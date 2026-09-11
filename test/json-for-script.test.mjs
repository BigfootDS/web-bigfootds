import assert from 'node:assert/strict';
import test from 'node:test';

import { serialiseJsonForScript } from '../src/lib/json-for-script.mjs';

test('escapes inline-script terminators and preserves JSON data', () => {
  const article = {
    headline: 'News </script><script>window.executed = true</script> & \u2028 \u2029',
    summary: 'Public text remains data, not markup.'
  };
  const serialised = serialiseJsonForScript(article);

  assert.doesNotMatch(serialised, /<\/?script/i);
  assert.doesNotMatch(serialised, /[<>&\u2028\u2029]/);
  assert.deepEqual(JSON.parse(serialised), article);
});

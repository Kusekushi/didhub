import { expect, test } from 'vitest';

test('debug react useState', () => {
  // Use require to mirror how modules are resolved in the test runtime
  // and print useful diagnostics.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const R = require('react');
  // Print to stdout so Vitest captures it in the test output
  // eslint-disable-next-line no-console
  console.log('debug.react.useState.type=', typeof R.useState);
  // eslint-disable-next-line no-console
  console.log('debug.react.version=', R.version || '(no version)');
  expect(typeof R.useState).toBe('function');
});

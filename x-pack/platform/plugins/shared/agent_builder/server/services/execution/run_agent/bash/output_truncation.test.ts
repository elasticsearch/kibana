/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { truncateBashOutput, SAFEGUARD_TOKEN_COUNT } from './output_truncation';

describe('truncateBashOutput', () => {
  it('passes through small outputs', () => {
    const r = truncateBashOutput('hello', 'world');
    expect(r).toEqual({ stdout: 'hello', stderr: 'world', truncated: false });
  });

  it('truncates stdout past the safeguard threshold', () => {
    const huge = 'x'.repeat(SAFEGUARD_TOKEN_COUNT * 5);
    const r = truncateBashOutput(huge, '');
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThan(huge.length);
  });

  it('truncates stderr past the safeguard threshold', () => {
    const huge = 'y'.repeat(SAFEGUARD_TOKEN_COUNT * 5);
    const r = truncateBashOutput('', huge);
    expect(r.truncated).toBe(true);
    expect(r.stderr.length).toBeLessThan(huge.length);
  });
});

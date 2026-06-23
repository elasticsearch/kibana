/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatByteSizeString, formatBytes } from './format_bytes';

describe('formatBytes', () => {
  it('formats byte counts with uppercase units', () => {
    expect(formatBytes(1073741824)).toBe('1.00 GB');
  });
});

describe('formatByteSizeString', () => {
  it('uppercases byte units in human-readable byte strings', () => {
    expect(formatByteSizeString('5b')).toBe('5B');
    expect(formatByteSizeString('156kb')).toBe('156KB');
    expect(formatByteSizeString('10mb')).toBe('10MB');
    expect(formatByteSizeString('1gb')).toBe('1GB');
  });

  it('formats numeric byte values', () => {
    expect(formatByteSizeString(1073741824)).toBe('1.00 GB');
  });

  it('preserves undefined values', () => {
    expect(formatByteSizeString()).toBeUndefined();
  });
});

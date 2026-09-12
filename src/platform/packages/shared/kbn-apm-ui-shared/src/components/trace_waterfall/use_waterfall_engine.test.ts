/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useWaterfallEngine } from './use_waterfall_engine';

describe('useWaterfallEngine', () => {
  const originalLocation = window.location;
  const originalGetItem = Storage.prototype.getItem;

  beforeEach(() => {
    // Reset location and localStorage
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '' },
    });
    Storage.prototype.getItem = jest.fn().mockReturnValue(null);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { writable: true, value: originalLocation });
    Storage.prototype.getItem = originalGetItem;
  });

  it('returns the prop engine when provided', () => {
    expect(useWaterfallEngine('charts')).toBe('charts');
    expect(useWaterfallEngine('dom')).toBe('dom');
  });

  it('reads from URL param when no prop is set', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?traceWaterfallEngine=charts' },
    });
    expect(useWaterfallEngine(undefined)).toBe('charts');
  });

  it('ignores unknown URL param values', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?traceWaterfallEngine=unknown' },
    });
    expect(useWaterfallEngine(undefined)).toBe('dom');
  });

  it('reads from localStorage when no prop or URL param', () => {
    Storage.prototype.getItem = jest.fn().mockReturnValue('charts');
    expect(useWaterfallEngine(undefined)).toBe('charts');
  });

  it('ignores unknown localStorage values', () => {
    Storage.prototype.getItem = jest.fn().mockReturnValue('unknown');
    expect(useWaterfallEngine(undefined)).toBe('dom');
  });

  it('prop beats URL param', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?traceWaterfallEngine=charts' },
    });
    expect(useWaterfallEngine('dom')).toBe('dom');
  });

  it('URL param beats localStorage', () => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?traceWaterfallEngine=dom' },
    });
    Storage.prototype.getItem = jest.fn().mockReturnValue('charts');
    expect(useWaterfallEngine(undefined)).toBe('dom');
  });

  it('falls back to dom when nothing is set', () => {
    expect(useWaterfallEngine(undefined)).toBe('dom');
  });
});

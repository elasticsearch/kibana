/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_STORED_PRESETS, normalize } from './common';

describe('date range picker preset common helpers', () => {
  it('normalizes missing stored presets to the unseeded default', () => {
    expect(normalize()).toEqual(DEFAULT_STORED_PRESETS);
  });

  it('keeps v1 stored presets unchanged', () => {
    const storedPresets = {
      version: 1 as const,
      presets: [{ start: 'now-7d', end: 'now', label: 'Last 7 days' }],
    };

    expect(normalize(storedPresets)).toBe(storedPresets);
  });
});

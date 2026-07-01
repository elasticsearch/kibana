/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mapQuickRanges } from './quick_ranges';

describe('date range picker quick ranges', () => {
  it('maps timepicker quick ranges to date range picker presets', () => {
    expect(mapQuickRanges([{ from: 'now/d', to: 'now/d', display: 'Today' }])).toEqual([
      { start: 'now/d', end: 'now/d', label: 'Today' },
    ]);
  });
});

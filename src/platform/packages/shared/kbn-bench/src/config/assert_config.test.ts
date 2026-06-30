/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { assertConfig } from './assert_config';

describe('assertConfig', () => {
  it('accepts configs with an onCompare callback', () => {
    expect(() =>
      assertConfig({
        name: 'memory-check',
        monitorInterval: 250,
        onCompare: () => {},
        benchmarks: [
          {
            kind: 'module',
            name: 'warm-start',
            module: './warm_start.js',
          },
        ],
      })
    ).not.toThrow();
  });

  it('rejects configs with a non-function onCompare', () => {
    expect(() =>
      assertConfig({
        name: 'memory-check',
        onCompare: 'not-a-function',
        benchmarks: [
          {
            kind: 'module',
            name: 'warm-start',
            module: './warm_start.js',
          },
        ],
      })
    ).toThrow('onCompare must be a function when provided');
  });
});

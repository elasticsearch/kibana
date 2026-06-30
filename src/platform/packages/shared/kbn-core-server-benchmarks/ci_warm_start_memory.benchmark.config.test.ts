/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import config from './ci_warm_start_memory.benchmark.config';

describe('ci_warm_start_memory.benchmark.config', () => {
  it('runs only the warm-start benchmark with high-frequency monitoring', () => {
    expect(config).toEqual(
      expect.objectContaining({
        name: 'kibana_ci_warm_start_memory',
        runs: 3,
        monitorInterval: 250,
        profile: false,
        benchmarks: [
          expect.objectContaining({
            kind: 'module',
            name: 'warm_start',
          }),
        ],
      })
    );
  });
});

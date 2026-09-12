/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getJestSwcConfig } from '../jest';

describe('getJestSwcConfig', () => {
  it('uses the shared Node parser and CommonJS configuration', () => {
    const config = getJestSwcConfig('/repo/example.tsx');

    expect(config.jsc?.parser).toEqual({
      syntax: 'typescript',
      tsx: true,
      decorators: true,
    });
    expect(config.module).toEqual({ type: 'commonjs' });
  });

  it('configures Emotion to retain development labels', () => {
    const config = getJestSwcConfig('/repo/example.tsx');

    expect(config.jsc?.experimental?.plugins).toEqual([
      [
        require.resolve('@swc/plugin-emotion'),
        {
          sourceMap: false,
          autoLabel: 'always',
          labelFormat: '[local]',
        },
      ],
    ]);
  });

  it('does not load external SWC configuration', () => {
    const config = getJestSwcConfig('/repo/example.ts');

    expect(config.swcrc).toBe(false);
    expect(config.configFile).toBe(false);
  });
});

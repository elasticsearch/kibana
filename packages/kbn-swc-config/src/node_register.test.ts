/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getNodeRegisterSwcConfig } from './node_register';

describe('getNodeRegisterSwcConfig', () => {
  it('uses the ecmascript parser for JavaScript files', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.js');

    expect(config.jsc.parser).toEqual({
      syntax: 'ecmascript',
      jsx: true,
      decorators: true,
    });
  });

  it('uses the TypeScript parser for TypeScript files', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts');

    expect(config.jsc.parser).toEqual({
      syntax: 'typescript',
      tsx: false,
      decorators: true,
    });
  });

  it('enables TSX parsing for TSX files', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.tsx');

    expect(config.jsc.parser).toEqual({
      syntax: 'typescript',
      tsx: true,
      decorators: true,
    });
  });

  it('omits the React transform for TypeScript files without JSX', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts');

    expect(config.jsc.transform.react).toBeUndefined();
  });

  it('keeps the React transform for TSX and JavaScript files', () => {
    const tsxConfig = getNodeRegisterSwcConfig('/repo/example.tsx');
    const jsConfig = getNodeRegisterSwcConfig('/repo/example.js');

    expect(tsxConfig.jsc.transform.react).toEqual({
      runtime: 'automatic',
      development: process.env.NODE_ENV !== 'production',
      importSource: '@emotion/react',
    });
    expect(jsConfig.jsc.transform.react).toEqual(tsxConfig.jsc.transform.react);
  });

  it('outputs CommonJS without preserving dynamic imports', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts');

    expect(config.module).toEqual({ type: 'commonjs' });
  });

  it('disables external SWC config loading', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts');

    expect(config.swcrc).toBe(false);
    expect(config.configFile).toBe(false);
  });

  it('returns source maps for runtime stack traces', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts');

    expect(config.sourceMaps).toBe(true);
    expect(config.inlineSourcesContent).toBe(true);
  });

  it('can omit inline source content when source maps are cached separately', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts', { inlineSourcesContent: false });

    expect(config.sourceMaps).toBe(true);
    expect(config.inlineSourcesContent).toBe(false);
  });

  it('can inline source maps when the caller is not caching them separately', () => {
    const config = getNodeRegisterSwcConfig('/repo/example.ts', { inlineSourceMaps: true });

    expect(config.sourceMaps).toBe('inline');
    expect(config.inlineSourcesContent).toBe(true);
  });
});

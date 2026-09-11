/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { transformSync } from '@swc/core';
import { getNodeRegisterSwcConfig } from '@kbn/swc-config/node_register';

import type { Cache } from '../cache/types';
import { swcTransform } from './swc';

jest.mock('@swc/core', () => ({
  transformSync: jest.fn(),
}));

jest.mock('@kbn/swc-config/node_register', () => ({
  getNodeRegisterSwcConfig: jest.fn((path: string, options = {}) => ({
    filename: path,
    sourceMaps: options.inlineSourceMaps ? 'inline' : true,
  })),
}));

const transformSyncMock = transformSync as jest.Mock;
const getNodeRegisterSwcConfigMock = getNodeRegisterSwcConfig as jest.Mock;

const makeCache = (code: string | undefined = undefined) => {
  const cache: Cache = {
    getKey: jest.fn(() => 'cache-key'),
    getCode: jest.fn(() => code),
    getSourceMap: jest.fn(),
    update: jest.fn(async () => undefined),
  };

  return cache;
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('returns cached code without calling SWC', () => {
  const cache = makeCache('cached code');

  expect(swcTransform('/repo/foo.ts', 'const value = 1;', cache)).toBe('cached code');
  expect(transformSyncMock).not.toHaveBeenCalled();
  expect(cache.update).not.toHaveBeenCalled();
});

it('caches compiled code and parsed source maps on misses', () => {
  const cache = makeCache();
  transformSyncMock.mockReturnValue({
    code: 'const value = 1;',
    map: JSON.stringify({ version: 3, sources: ['foo.ts'], names: [], mappings: 'AAAA' }),
  });

  expect(swcTransform('/repo/foo.ts', 'const value: number = 1;', cache)).toBe('const value = 1;');
  expect(getNodeRegisterSwcConfigMock).toHaveBeenCalledWith('/repo/foo.ts', {
    inlineSourceMaps: false,
    inlineSourcesContent: false,
  });
  expect(cache.update).toHaveBeenCalledWith('cache-key', {
    code: 'const value = 1;',
    map: { version: 3, sources: ['foo.ts'], names: [], mappings: 'AAAA' },
  });
});

it('uses inline source maps when no persistent cache is available', () => {
  transformSyncMock.mockReturnValue({
    code: 'const value = 1;\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==',
  });

  expect(swcTransform('/repo/foo.ts', 'const value: number = 1;')).toBe(
    'const value = 1;\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ=='
  );
  expect(getNodeRegisterSwcConfigMock).toHaveBeenCalledWith('/repo/foo.ts', {
    inlineSourceMaps: true,
    inlineSourcesContent: true,
  });
});

it('throws when SWC does not return code', () => {
  const cache = makeCache();
  transformSyncMock.mockReturnValue({ code: '' });

  expect(() => swcTransform('/repo/foo.ts', 'const value: number = 1;', cache)).toThrow(
    'swc failed to transpile [/repo/foo.ts]'
  );
  expect(cache.update).not.toHaveBeenCalled();
});

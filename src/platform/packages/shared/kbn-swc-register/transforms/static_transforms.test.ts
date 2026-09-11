/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Peggy from '@kbn/peggy';

import type { Cache } from '../cache/types';
import { dotTextTransform } from './dot_text';
import { peggyTransform } from './peggy';
import { yamlTransform } from './yaml';

jest.mock('@kbn/peggy', () => ({
  findConfigFile: jest.fn(() => '/repo/peggy.config.js'),
  getJsSourceSync: jest.fn(() => ({ source: 'compiled peggy' })),
}));

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

it('caches dot-text transforms', () => {
  const cache = makeCache();

  expect(dotTextTransform('/repo/foo.text', 'hello', cache)).toBe('module.exports = "hello";\n');
  expect(cache.update).toHaveBeenCalledWith('cache-key', {
    code: 'module.exports = "hello";\n',
  });
});

it('returns cached dot-text transforms', () => {
  const cache = makeCache('cached dot text');

  expect(dotTextTransform('/repo/foo.text', 'hello', cache)).toBe('cached dot text');
});

it('caches peggy transforms', () => {
  const cache = makeCache();

  expect(peggyTransform('/repo/foo.peggy', 'start = "a"', cache)).toBe('compiled peggy');
  expect(Peggy.findConfigFile).toHaveBeenCalledWith('/repo/foo.peggy');
  expect(Peggy.getJsSourceSync).toHaveBeenCalledWith({
    content: 'start = "a"',
    path: '/repo/foo.peggy',
    format: 'commonjs',
    optimize: 'speed',
    config: '/repo/peggy.config.js',
    skipConfigSearch: true,
  });
  expect(cache.update).toHaveBeenCalledWith('cache-key', { code: 'compiled peggy' });
});

it('caches yaml transforms', () => {
  const cache = makeCache();

  expect(yamlTransform('/repo/foo.yaml', 'hello: world', cache)).toBe(
    'module.exports = "hello: world";\n'
  );
  expect(cache.update).toHaveBeenCalledWith('cache-key', {
    code: 'module.exports = "hello: world";\n',
  });
});

it('returns compiled output without a cache', () => {
  expect(dotTextTransform('/repo/foo.text', 'hello')).toBe('module.exports = "hello";\n');
  expect(peggyTransform('/repo/foo.peggy', 'start = "a"')).toBe('compiled peggy');
  expect(yamlTransform('/repo/foo.yaml', 'hello: world')).toBe(
    'module.exports = "hello: world";\n'
  );
});

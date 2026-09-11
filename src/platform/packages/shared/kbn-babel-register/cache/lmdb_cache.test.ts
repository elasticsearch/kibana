/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import { Writable } from 'stream';

import del from 'del';

import { LmdbCache } from './lmdb_cache';

const DIR = Path.resolve(__dirname, '../__tmp__/cache');

const makeTestLog = () => {
  const log = Object.assign(
    new Writable({
      write(chunk, _, cb) {
        log.output += chunk;
        cb();
      },
    }),
    {
      output: '',
    }
  );

  return log;
};

const instances: LmdbCache[] = [];
const makeCache = (...options: ConstructorParameters<typeof LmdbCache>) => {
  const instance = new LmdbCache(...options);
  instances.push(instance);
  return instance;
};

beforeEach(async () => await del(DIR));
afterEach(async () => await del(DIR));

it('returns undefined until values are set', async () => {
  const path = '/foo/bar.js';
  const source = `console.log("hi, hello")`;
  const log = makeTestLog();
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
    log,
  });

  const key = cache.getKey(path, source);
  expect(cache.getCode(key)).toBe(undefined);
  expect(cache.getSourceMap(key)).toBe(undefined);

  await cache.update(key, {
    code: 'var x = 1',
    map: { foo: 'bar' },
  });

  expect(cache.getCode(key)).toBe('var x = 1');
  expect(cache.getSourceMap(key)).toEqual({ foo: 'bar' });
  expect(log.output).toMatchInlineSnapshot(`
    "MISS   [db]   prefix:05a4b8198c4ec215d54d94681ef00ca9ecb45931
    MISS   [db]   prefix:05a4b8198c4ec215d54d94681ef00ca9ecb45931
    PUT   [db]   prefix:05a4b8198c4ec215d54d94681ef00ca9ecb45931
    HIT   [db]   prefix:05a4b8198c4ec215d54d94681ef00ca9ecb45931
    HIT   [db]   prefix:05a4b8198c4ec215d54d94681ef00ca9ecb45931
    "
  `);
});

it('supports UTF-8 cache keys', async () => {
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });
  const key = 'prefix:日本語:🚀';

  await cache.update(key, { code: 'var utf8 = true' });
  expect(cache.getCode(key)).toBe('var utf8 = true');
});

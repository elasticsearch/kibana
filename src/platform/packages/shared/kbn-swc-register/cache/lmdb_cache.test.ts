/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Fs from 'fs';
import Path from 'path';
import { Writable } from 'stream';

import del from 'del';
import LmdbStore = require('lmdb');
import type { RootDatabaseOptions } from 'lmdb';

import { LmdbCache } from './lmdb_cache';
import { utf8StringKeyEncoder } from './lmdb_key_encoder';

const DIR = Path.resolve(__dirname, '../__tmp__/cache');
const DB_DIR = Path.resolve(DIR, 'v2');
const DAY = 1000 * 60 * 60 * 24;
const GLOBAL_ATIME = new Date().setHours(0, 0, 0, 0);

const getCodeKey = (key: string) => `code:${key}`;
const getMapKey = (key: string) => `map:${key}`;

const makeTestFile = (name: string, source: string) => {
  const path = Path.resolve(DIR, name);
  Fs.mkdirSync(Path.dirname(path), { recursive: true });
  Fs.writeFileSync(path, source);
  return path;
};

const getExpectedMetadataKey = (path: string) => {
  const stat = Fs.statSync(path, { bigint: true });
  const keyParts = [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs].map(
    (value) => value.toString()
  );

  return `prefix:stat:${keyParts.join(':')}:${Path.resolve(path)}`;
};

const openDb = () => {
  const databaseOptions: RootDatabaseOptions & {
    keyEncoder: typeof utf8StringKeyEncoder;
  } = {
    name: 'db',
    encoding: 'json',
    keyEncoder: utf8StringKeyEncoder,
  };

  return LmdbStore.open<unknown, string>(DB_DIR, databaseOptions);
};

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

const caches: LmdbCache[] = [];

const makeCache = (...options: ConstructorParameters<typeof LmdbCache>) => {
  const cache = new LmdbCache(...options);
  caches.push(cache);
  return cache;
};

beforeEach(async () => await del(DIR));
afterEach(async () => {
  await Promise.all(caches.splice(0).map((cache) => cache.close()));
  await del(DIR);
});

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
  expect(key).toBe('prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b');
  expect(cache.getCode(key)).toBe(undefined);
  expect(cache.getSourceMap(key)).toBe(undefined);

  await cache.update(key, {
    code: 'var x = 1',
    map: { foo: 'bar' },
  });

  expect(cache.getCode(key)).toBe('var x = 1');
  expect(cache.getSourceMap(key)).toEqual({ foo: 'bar' });
  expect(log.output).toMatchInlineSnapshot(`
    "MISS   [db]   code:prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b
    MISS   [db]   map:prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b
    PUT   [db]   code:prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b
    PUT   [db]   map:prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b
    HIT   [db]   code:prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b
    HIT   [db]   map:prefix:1bfb4256d4a036a897e0582a67bb23417da30bf3975c7e59da5d5a211a6ce74b
    "
  `);
});

it('uses file metadata for cache keys when available', () => {
  const source = `console.log("hi, hello")`;
  const path = makeTestFile('metadata.js', source);
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });

  expect(cache.getKey(path, source)).toBe(getExpectedMetadataKey(path));
});

it('changes metadata cache keys when file metadata changes', () => {
  const source = `console.log("before")`;
  const path = makeTestFile('changed.js', source);
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });

  const initialKey = cache.getKey(path, source);
  const updatedSource = `${source}\nconsole.log("after")`;
  Fs.writeFileSync(path, updatedSource);

  expect(cache.getKey(path, updatedSource)).toBe(getExpectedMetadataKey(path));
  expect(cache.getKey(path, updatedSource)).not.toBe(initialKey);
});

it('stores code and source maps separately', async () => {
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });
  const key = cache.getKey('/foo/bar.js', 'source');

  await cache.update(key, {
    code: 'var x = 1',
    map: { foo: 'bar' },
  });

  const db = openDb();
  expect(db.get(getCodeKey(key))).toEqual([GLOBAL_ATIME, 'var x = 1']);
  expect(db.get(getMapKey(key))).toEqual({ foo: 'bar' });
  await db.close();
});

it('supports UTF-8 cache keys', async () => {
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });
  const key = 'prefix:日本語:🚀';

  await cache.update(key, {
    code: 'var utf8 = true',
  });
  await cache.close();

  const db = openDb();
  expect(Array.from(db.getKeys())).toContain(`code:${key}`);
  await db.close();
});

it('does not write source maps for transforms without source maps', async () => {
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });
  const key = cache.getKey('/foo/bar.yaml', 'foo: bar');

  await cache.update(key, {
    code: 'module.exports = "foo: bar";',
  });

  expect(cache.getCode(key)).toBe('module.exports = "foo: bar";');
  expect(cache.getSourceMap(key)).toBe(undefined);

  const db = openDb();
  expect(db.get(getMapKey(key))).toBe(undefined);
  await db.close();
});

it('drains pending async writes on explicit close', async () => {
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
  });
  const key = cache.getKey('/foo/pending.js', 'source');

  void cache.update(key, {
    code: 'var pending = true',
    map: { pending: true },
  });

  await cache.close();

  const db = openDb();
  expect(db.get(getCodeKey(key))).toEqual([GLOBAL_ATIME, 'var pending = true']);
  expect(db.get(getMapKey(key))).toEqual({ pending: true });
  await db.close();
});

it('only refreshes atime for entries older than the refresh interval', async () => {
  const log = makeTestLog();
  const cache = makeCache({
    dir: DIR,
    prefix: 'prefix',
    log,
  });
  const freshKey = cache.getKey('/foo/fresh.js', 'source');
  const staleKey = cache.getKey('/foo/stale.js', 'source');

  const db = openDb();
  db.putSync(getCodeKey(freshKey), [GLOBAL_ATIME - 6 * DAY, 'fresh']);
  db.putSync(getCodeKey(staleKey), [GLOBAL_ATIME - 8 * DAY, 'stale']);
  await db.close();

  log.output = '';
  expect(cache.getCode(freshKey)).toBe('fresh');
  expect(cache.getCode(staleKey)).toBe('stale');

  // Drain the fire-and-forget atime-refresh put so its PUT log line is deterministic.
  await cache.close();

  expect(log.output).toBe(
    `HIT   [db]   ${getCodeKey(freshKey)}\n` +
      `HIT   [db]   ${getCodeKey(staleKey)}\n` +
      `PUT   [db]   ${getCodeKey(staleKey)}\n`
  );
});

it('prunes stale code entries and their source maps', async () => {
  const db = openDb();
  db.putSync('code:old', [GLOBAL_ATIME - 31 * DAY, 'old']);
  db.putSync('map:old', { old: true });
  db.putSync('code:fresh', [GLOBAL_ATIME - 1 * DAY, 'fresh']);
  db.putSync('map:fresh', { fresh: true });
  db.putSync('legacy', [GLOBAL_ATIME - 31 * DAY, 'legacy', { legacy: true }]);
  await db.close();

  makeCache({
    dir: DIR,
    prefix: 'prefix',
  });

  const updatedDb = openDb();
  expect(updatedDb.get('code:old')).toBe(undefined);
  expect(updatedDb.get('map:old')).toBe(undefined);
  expect(updatedDb.get('legacy')).toBe(undefined);
  expect(updatedDb.get('code:fresh')).toEqual([GLOBAL_ATIME - 1 * DAY, 'fresh']);
  expect(updatedDb.get('map:fresh')).toEqual({ fresh: true });
  await updatedDb.close();
});

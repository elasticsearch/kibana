/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  findLocalCachedSnapshot,
  getSnapshotCacheFilename,
  shouldPreferCachedSnapshot,
} from './find_local_cached_snapshot';

const previousUseCached = process.env.KBN_ES_SNAPSHOT_USE_CACHED;

afterEach(() => {
  if (previousUseCached === undefined) {
    delete process.env.KBN_ES_SNAPSHOT_USE_CACHED;
  } else {
    process.env.KBN_ES_SNAPSHOT_USE_CACHED = previousUseCached;
  }
});

describe('shouldPreferCachedSnapshot', () => {
  it('returns true when useCached is passed', () => {
    expect(shouldPreferCachedSnapshot(true)).toBe(true);
  });

  it('returns true when KBN_ES_SNAPSHOT_USE_CACHED is set', () => {
    process.env.KBN_ES_SNAPSHOT_USE_CACHED = 'true';
    expect(shouldPreferCachedSnapshot()).toBe(true);
  });

  it('returns false by default', () => {
    delete process.env.KBN_ES_SNAPSHOT_USE_CACHED;
    expect(shouldPreferCachedSnapshot()).toBe(false);
  });
});

describe('getSnapshotCacheFilename', () => {
  it('builds the expected filename for the current platform', () => {
    const platform = process.platform === 'win32' ? 'windows' : process.platform;
    const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
    const ext = platform === 'windows' ? 'zip' : 'tar.gz';

    expect(getSnapshotCacheFilename('9.5.0')).toBe(
      `elasticsearch-9.5.0-SNAPSHOT-${platform}-${arch}.${ext}`
    );
  });
});

describe('findLocalCachedSnapshot', () => {
  it('returns the cached snapshot when it exists', () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'es-cache-'));
    const cacheDir = path.join(basePath, 'cache');
    fs.mkdirSync(cacheDir);

    const filename = getSnapshotCacheFilename('9.5.0');
    const snapshotPath = path.join(cacheDir, filename);
    fs.writeFileSync(snapshotPath, 'snapshot');

    expect(findLocalCachedSnapshot(basePath, '9.5.0')).toBe(snapshotPath);

    fs.rmSync(basePath, { recursive: true, force: true });
  });

  it('returns undefined when no cache exists', () => {
    const basePath = fs.mkdtempSync(path.join(os.tmpdir(), 'es-cache-'));
    expect(findLocalCachedSnapshot(basePath, '9.5.0')).toBeUndefined();
    fs.rmSync(basePath, { recursive: true, force: true });
  });
});

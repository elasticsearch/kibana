/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import fs from 'fs';
import path from 'path';

import { findMostRecentlyChanged } from './find_most_recently_changed';

export function shouldPreferCachedSnapshot(useCached = false) {
  return useCached || process.env.KBN_ES_SNAPSHOT_USE_CACHED === 'true';
}

export function getSnapshotPlatformArch() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
  const ext = platform === 'windows' ? 'zip' : 'tar.gz';

  return { platform, arch, ext };
}

export function getSnapshotCacheFilename(version: string) {
  const normalizedVersion = version.replace(/-SNAPSHOT$/, '');
  const { platform, arch, ext } = getSnapshotPlatformArch();

  return `elasticsearch-${normalizedVersion}-SNAPSHOT-${platform}-${arch}.${ext}`;
}

export function findLocalCachedSnapshot(basePath: string, version: string) {
  const cacheDir = path.resolve(basePath, 'cache');
  if (!fs.existsSync(cacheDir)) {
    return;
  }

  const preferredPath = path.resolve(cacheDir, getSnapshotCacheFilename(version));
  if (fs.existsSync(preferredPath)) {
    return preferredPath;
  }

  const normalizedVersion = version.replace(/-SNAPSHOT$/, '');
  const { platform, arch, ext } = getSnapshotPlatformArch();
  const pattern = path.resolve(
    cacheDir,
    `elasticsearch-${normalizedVersion}-SNAPSHOT-${platform}-${arch}.${ext}`
  );

  return findMostRecentlyChanged(pattern);
}

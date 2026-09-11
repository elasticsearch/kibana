/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Writable } from 'stream';

export interface CacheConfig {
  dir: string;
  prefix: string;
  log?: Writable;
}

export interface Cache {
  getKey(path: string, source: string): string;
  getCode(key: string): string | undefined;
  getSourceMap(key: string): object | undefined;
  update(key: string, entry: { code: string; map?: object | null }): Promise<void>;
}

export type LegacyCacheEntry = [atime: number, code: string, sourceMap: object | undefined];
export type CodeCacheEntry = [atime: number, code: string];
export type CacheEntry = LegacyCacheEntry | CodeCacheEntry | object;

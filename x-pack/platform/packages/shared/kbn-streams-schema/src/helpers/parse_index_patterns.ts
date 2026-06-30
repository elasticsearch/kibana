/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DEFAULT_INDEX_PATTERNS } from './default_index_patterns';

/**
 * Parses a comma-separated index patterns setting value into a normalized list.
 * Trims entries, drops empty ones, and falls back to the default pattern when
 * nothing valid remains.
 */
export function parseIndexPatterns(rawValue: string): string[] {
  const patterns = rawValue
    .split(',')
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
  return patterns.length > 0 ? patterns : [DEFAULT_INDEX_PATTERNS];
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isRecord } from '../../../../common/lib/type_guards';

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export const isUnsafeYamlPathSegment = (segment: string | number): boolean =>
  typeof segment === 'string' && UNSAFE_PATH_SEGMENTS.has(segment);

/**
 * Reads a value from a workflow definition using YAML path segments without lodash.get,
 * so keys like "__proto__" cannot traverse Object.prototype.
 */
export function getValueAtYamlPath<T = unknown>(
  root: unknown,
  path: ReadonlyArray<string | number>
): T | undefined {
  if (path.some(isUnsafeYamlPathSegment)) {
    return undefined;
  }

  let current: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
    } else if (!isRecord(current) || !Object.hasOwn(current, segment)) {
      return undefined;
    } else {
      current = current[segment];
    }
  }

  return current as T;
}

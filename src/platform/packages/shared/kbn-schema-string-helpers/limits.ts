/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Keep these defaults aligned with core's saved_objects_length_limits.ts.
export const STRING_HELPER_DEFAULTS = {
  savedObjectId: { minLength: 1, maxLength: 512 },
  savedObjectType: { minLength: 0, maxLength: 256 },
  savedObjectVersion: { minLength: 0, maxLength: 256 },
  spaceId: { minLength: 1, maxLength: 512 },
  displayName: { minLength: 1, maxLength: 1024 },
  description: { minLength: 0, maxLength: 10_000 },
  searchFilter: { minLength: 0, maxLength: 10_000 },
  aggregation: { minLength: 0, maxLength: 100_000 },
  querySortField: { minLength: 0, maxLength: 256 },
} as const;

export type StringHelperName = keyof typeof STRING_HELPER_DEFAULTS;

export interface StringHelperLimits {
  readonly minLength: number;
  readonly maxLength: number;
}

/** Resolves finite string limits, preserving defaults for undefined overrides. */
export const getStringHelperLimits = (
  helper: StringHelperName,
  overrides: Partial<StringHelperLimits> = {}
): StringHelperLimits => {
  const defaults = STRING_HELPER_DEFAULTS[helper];
  const minLength = overrides.minLength ?? defaults.minLength;
  const maxLength = overrides.maxLength ?? defaults.maxLength;
  if (
    !Number.isSafeInteger(minLength) ||
    !Number.isSafeInteger(maxLength) ||
    minLength < 0 ||
    maxLength < minLength
  ) {
    throw new Error(`${helper}() requires non-negative integer limits with minLength <= maxLength`);
  }
  return { minLength, maxLength };
};

/** Requires an explanation when opting out of a string length bound. */
export const assertUnboundedStringReason = (reason: string): void => {
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    throw new Error(
      'unboundedString() requires a non-empty reason explaining why no maximum length is set'
    );
  }
};

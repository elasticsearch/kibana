/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

const CANONICAL_UNSIGNED_DECIMAL_PATTERN = /^0$|^[1-9]\d*$/;

export const normalizeIntegerRevision = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) {
      return undefined;
    }

    return value;
  }

  if (typeof value !== 'string' || !CANONICAL_UNSIGNED_DECIMAL_PATTERN.test(value)) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || String(parsed) !== value) {
    return undefined;
  }

  return parsed;
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHmac } from 'crypto';

const DEFAULT_HASH_LENGTH = 32;
const MAX_HASH_LENGTH = 64;

/**
 * Generates a deterministic anonymization token for a PII value.
 *
 * Format: `<ENTITY_CLASS>_<hash>` where the hash is the first `hashLength` hex
 * characters of HMAC-SHA256 keyed with `executionScope`.
 *
 * The `executionScope` is per-execution (derived from the server salt + session ID
 * in `createPiiTokenizationContext`), so tokens are stable within an execution but
 * opaque across executions or spaces.
 *
 * Deliberately independent of `@kbn/anonymization-common` — that package belongs
 * to the abandoned third-effort anonymization plugin.
 */
export const generateEntityToken = (
  executionScope: string,
  entityClass: string,
  value: string,
  hashLength = DEFAULT_HASH_LENGTH
): string => {
  if (!entityClass) {
    throw new Error('entityClass must be a non-empty string');
  }

  const clampedLen =
    Number.isFinite(hashLength) && hashLength > 0
      ? Math.min(Math.floor(hashLength), MAX_HASH_LENGTH)
      : DEFAULT_HASH_LENGTH;

  // Length-prefixed format prevents delimiter collisions when components
  // contain the separator character.
  const hmacInput = `${entityClass.length}:${entityClass}:${value.length}:${value}`;
  const hash = createHmac('sha256', executionScope).update(hmacInput).digest('hex');
  return `${entityClass}_${hash.substring(0, clampedLen)}`;
};

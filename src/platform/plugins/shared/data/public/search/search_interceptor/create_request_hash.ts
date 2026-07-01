/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Sha256 } from '@kbn/crypto-browser';
import { stableStringify } from '@kbn/std';

/**
 * Generate the hash for this request.
 *
 * Ignores the `preference` parameter since it generally won't
 * match from one request to another identical request.
 *
 * (Preference is used to ensure all queries go to the same set of shards and it doesn't need to be hashed
 * https://www.elastic.co/guide/en/elasticsearch/reference/current/search-shard-routing.html#shard-and-node-preference)
 */
function createRequestHash(keys: Record<string, unknown>) {
  const { preference, ...rest } = keys;
  const hash = new Sha256().update(stableStringify(rest), 'utf8').digest('hex');
  return hash;
}

/**
 * Generates the hash used as a key in the client-side request cache.
 */
export const createRequestHashForClientCache = createRequestHash;

/**
 * Generates the hash for associating requests with background searches stored on the server.
 *
 * Ignores sessionId for compatibility with background searches created before https://github.com/elastic/kibana/pull/237191
 */
export const createRequestHashForBackgroundSearches = (keys: Record<string, unknown>) => {
  // exclude additional parameters that are not relevant for server-side caching
  const { sessionId, ...rest } = keys;
  return createRequestHash(rest);
};

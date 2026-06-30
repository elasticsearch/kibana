/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { castArray } from 'lodash';
import type { IndicesResolveIndexResponse } from '@elastic/elasticsearch/lib/api/types';

/**
 * Builds a reverse map from concrete Elasticsearch index names (what
 * `field_caps` reports in its `indices` arrays) back to the clean "source" name
 * that belongs in an ESQL `FROM`:
 *
 * - a data stream's backing indices (`.ds-…-NNNNNN`) map to the data stream name;
 * - an alias' member indices map to the alias name;
 * - standalone (classic) indices map to themselves.
 *
 * This is what keeps churning backing-index names out of the `FROM`: the names
 * we emit come from `resolveIndex`, while `field_caps` is used only as a
 * presence/type filter.
 *
 * Precedence (low → high): standalone, alias, data stream. A concrete index
 * resolves to itself unless it is an alias member, and an alias member resolves
 * to its alias unless it is also a data stream backing index (data stream wins,
 * since that is the only stable name for a `.ds-…` index).
 */
export const buildConcreteIndexToSourceNameMap = (
  resolve: IndicesResolveIndexResponse
): Map<string, string> => {
  const map = new Map<string, string>();

  // Standalone indices (lowest precedence): map to themselves.
  for (const index of resolve.indices) {
    map.set(index.name, index.name);
  }

  // Aliases: each member index resolves to the alias name (covers e.g. the
  // alerts alias whose `field_caps` results are the hidden `.internal.*` indices).
  for (const alias of resolve.aliases) {
    for (const member of castArray(alias.indices)) {
      map.set(member, alias.name);
    }
  }

  // Data streams (highest precedence): backing indices resolve to the data
  // stream name — the only stable name for a rolled-over `.ds-…` index.
  for (const dataStream of resolve.data_streams) {
    for (const backingIndex of castArray(dataStream.backing_indices)) {
      map.set(backingIndex, dataStream.name);
    }
  }

  return map;
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';

/**
 * Pre-flight fix for ESQL `cluster_block_exception` on closed data-stream backing indices.
 *
 * ESQL has no `ignore_unavailable`. When a data stream has a closed backing index,
 * the entire FROM clause fails at resolution time — before any shard-level exclusion applies.
 * Negating the backing index name alone does NOT help; you must negate the data stream name
 * and re-add only its open backing indices explicitly.
 *
 * Example — input patterns: ['logs-myapp-*', '-logs-myapp-debug-*']
 *   data stream `logs-myapp-prod` has backing indices: [.ds-...-000001 (open), .ds-...-000002 (closed)]
 *   → openBackingIndices: ['.ds-...-000001']
 *   → negations:          ['-logs-myapp-prod']
 *   Caller builds FROM:   logs-myapp-*, .ds-...-000001, -logs-myapp-debug-*, -logs-myapp-prod
 *
 * Both arrays must be spliced into the ESQL FROM-clause pattern list in order:
 *   [...originalPositives, ...openBackingIndices, ...userExclusions, ...negations]
 *
 * Returns `{ openBackingIndices: [], negations: [] }` on empty input or resolve failure.
 */
export interface ClosedIndexAdjustments {
  /** Open backing indices of affected data streams — must be inserted as positive patterns BEFORE any negations. */
  openBackingIndices: string[];
  /**
   * Negation patterns (`-<name>`) for affected data stream names and closed standalone indices.
   * Must be inserted AFTER all positive includes.
   */
  negations: string[];
}

const toArray = (v: string | string[]): string[] => ([] as string[]).concat(v);

const resolveArgs = (name: string[]) => ({
  name,
  expand_wildcards: ['open', 'closed', 'hidden'] as Array<'open' | 'closed' | 'hidden'>,
  ignore_unavailable: true,
  allow_no_indices: true,
});

export const resolveClosedIndexAdjustments = async (
  esClient: ElasticsearchClient,
  includePatterns: string[],
  logger: Logger
): Promise<ClosedIndexAdjustments> => {
  const positivePatterns = includePatterns.filter((p) => !p.startsWith('-'));
  if (positivePatterns.length === 0) {
    return { openBackingIndices: [], negations: [] };
  }

  try {
    const resolved = await esClient.indices.resolveIndex(resolveArgs(positivePatterns));

    // Closed standalone indices (not part of a data stream): negate by concrete name.
    const closedStandaloneNegations = resolved.indices
      .filter((i) => i.attributes?.includes('closed'))
      .map((i) => `-${i.name}`);

    const openBackingIndices: string[] = [];
    const dataStreamNegations: string[] = [];

    const backingIndexNames = resolved.data_streams.flatMap((ds) => toArray(ds.backing_indices));
    if (backingIndexNames.length > 0) {
      // Second call with concrete backing index names — the first call returns them as plain
      // strings with no open/closed attributes; we need this call to learn their status.
      const backingResolved = await esClient.indices.resolveIndex(resolveArgs(backingIndexNames));

      const closedBackingNames = new Set(
        backingResolved.indices.filter((i) => i.attributes?.includes('closed')).map((i) => i.name)
      );

      for (const ds of resolved.data_streams) {
        const backing = toArray(ds.backing_indices);
        if (!backing.some((bi) => closedBackingNames.has(bi))) continue;

        // Negate the data stream name so ESQL never expands it to its backing indices
        // (which would hit the closed one before the exclusion applies).
        dataStreamNegations.push(`-${ds.name}`);

        // Add back every open backing index explicitly so coverage is preserved.
        openBackingIndices.push(...backing.filter((bi) => !closedBackingNames.has(bi)));
      }
    }

    const negations = [...closedStandaloneNegations, ...dataStreamNegations];

    if (negations.length > 0 || openBackingIndices.length > 0) {
      logger.warn(
        `Detected closed backing indices. Excluding data streams/indices: ${negations.join(', ')}` +
          (openBackingIndices.length > 0
            ? `; adding open backing indices back: ${openBackingIndices.join(', ')}`
            : '')
      );
    }

    return { openBackingIndices, negations };
  } catch (error) {
    logger.warn(
      `Failed to resolve closed indices (falling back to unfiltered patterns): ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return { openBackingIndices: [], negations: [] };
  }
};

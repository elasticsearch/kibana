/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PersonaMatrixExample } from './persona_matrix_prompts';

/**
 * Select this run's slice of the dataset from a `"<index>/<total>"` spec.
 *
 * Slow models need ~5-20 min per example, so a 21-example run serialises into
 * hours on one stack. Splitting the dataset across VMs (one Kibana each — the
 * suite's beforeAll/afterAll share seed indices, so extra in-process workers
 * would tear down live fixtures) is the only safe parallelism.
 *
 * Assignment is by stride (`i % total`), not contiguous slicing: per-example
 * cost is heavily skewed, so neighbouring examples must land on different
 * shards to keep wall clock balanced.
 */
export function selectShard(
  examples: PersonaMatrixExample[],
  spec: string | undefined
): PersonaMatrixExample[] {
  if (!spec) {
    return examples;
  }

  const match = /^(\d+)\/(\d+)$/.exec(spec.trim());
  const index = match ? Number(match[1]) : NaN;
  const total = match ? Number(match[2]) : NaN;

  // Reject rather than fall back to the full dataset: a silent fallback makes
  // every shard run all 21 examples while the sweep still reports "complete".
  if (!match || total < 1 || index < 1 || index > total) {
    throw new Error(
      `PERSONA_MATRIX_SHARD must be "<index>/<total>" with 1 <= index <= total, got "${spec}"`
    );
  }

  return examples.filter((_, position) => position % total === index - 1);
}

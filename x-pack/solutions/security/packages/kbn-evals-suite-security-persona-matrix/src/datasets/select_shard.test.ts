/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PERSONA_MATRIX_EXAMPLES } from './persona_matrix_prompts';
import { selectShard } from './select_shard';

describe('selectShard', () => {
  const examples = PERSONA_MATRIX_EXAMPLES;

  it('returns every example when no shard is requested', () => {
    expect(selectShard(examples, undefined)).toHaveLength(21);
    expect(selectShard(examples, '')).toHaveLength(21);
  });

  it('is the identity for 1/1', () => {
    expect(selectShard(examples, '1/1').map((e) => e.id)).toEqual(examples.map((e) => e.id));
  });

  it('partitions the dataset: shards are disjoint and cover everything', () => {
    const shards = [1, 2, 3, 4].map((i) => selectShard(examples, `${i}/4`));
    const ids = shards.flat().map((e) => e.id);

    // No example runs twice — a duplicate would double-bill the slowest models
    // and break the union doc-count gate.
    expect(new Set(ids).size).toBe(ids.length);
    // No example is dropped — a silent gap reads as "model scored fewer points"
    // rather than "we never asked it that question".
    expect(new Set(ids)).toEqual(new Set(examples.map((e) => e.id)));
  });

  it('balances shards to within one example', () => {
    // Stride assignment, not contiguous slicing: the per-example cost is skewed
    // (measured median 75 model calls, max 280), so adjacent examples must not
    // pile onto one shard.
    const sizes = [1, 2, 3, 4].map((i) => selectShard(examples, `${i}/4`).length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
  });

  it.each(['0/4', '5/4', 'x/y', '1/0', '3', '-1/4', '1/4/9'])(
    'throws on malformed shard %p rather than silently running all 21',
    (bad) => {
      // Silently falling back to the full dataset is the dangerous failure:
      // every shard would run every example and the run would look "complete".
      expect(() => selectShard(examples, bad)).toThrow(/PERSONA_MATRIX_SHARD/);
    }
  );
});

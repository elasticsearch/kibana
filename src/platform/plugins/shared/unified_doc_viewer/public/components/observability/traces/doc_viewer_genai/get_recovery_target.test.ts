/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import { getGenAiRecoveryTarget } from './get_recovery_target';

function buildHit({
  flattened = {},
  _id,
  _index,
}: {
  flattened?: Record<string, unknown>;
  _id?: string;
  _index?: string;
}): DataTableRecord {
  return {
    id: _id ?? 'row-1',
    raw: {
      _id,
      _index,
    },
    flattened,
  } as unknown as DataTableRecord;
}

const INDEX_PATTERN = 'traces-apm*,traces-*.otel-*';

describe('getGenAiRecoveryTarget', () => {
  describe('_id-based path', () => {
    it('returns an ids query with _index when both are present', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ _id: 'doc-1', _index: '.ds-traces-otel-default-000001' }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target).toMatchObject({
        index: '.ds-traces-otel-default-000001',
        query: { bool: { filter: [{ ids: { values: ['doc-1'] } }] } },
      });
    });

    it('falls back to indexPattern when _index is absent but _id is present', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ _id: 'doc-2', _index: undefined }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target).toMatchObject({
        index: INDEX_PATTERN,
        query: { bool: { filter: [{ ids: { values: ['doc-2'] } }] } },
      });
    });

    it('returns undefined when _id is present but neither _index nor indexPattern is given', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ _id: 'doc-3', _index: undefined }),
      });

      expect(target).toBeUndefined();
    });

    it('produces a stable cacheKey that encodes id and index', () => {
      const a = getGenAiRecoveryTarget({
        hit: buildHit({ _id: 'doc-4', _index: 'idx' }),
        indexPattern: INDEX_PATTERN,
      });
      const b = getGenAiRecoveryTarget({
        hit: buildHit({ _id: 'doc-4', _index: 'idx' }),
        indexPattern: INDEX_PATTERN,
      });

      expect(a?.cacheKey).toBe(b?.cacheKey);
      expect(a?.cacheKey).toContain('doc-4');
    });
  });

  describe('span.id-based path', () => {
    it('returns a span.id term query when _id is absent', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': 'abc123def456' } }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target).toMatchObject({
        index: INDEX_PATTERN,
        query: {
          bool: {
            filter: [{ term: { 'span.id': 'abc123def456' } }],
          },
        },
      });
    });

    it('adds a trace.id term when trace.id is also on the row', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({
          flattened: {
            'span.id': 'abc123def456',
            'trace.id': 'trace-xyz',
          },
        }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target?.query).toEqual({
        bool: {
          filter: [{ term: { 'span.id': 'abc123def456' } }, { term: { 'trace.id': 'trace-xyz' } }],
        },
      });
    });

    it('accepts OTel native span_id (underscored)', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { span_id: 'otel-span-1' } }),
        indexPattern: INDEX_PATTERN,
      });

      // The ES query uses the dotted ECS alias regardless of how the value was read.
      expect(target?.query).toEqual({
        bool: {
          filter: [{ term: { 'span.id': 'otel-span-1' } }],
        },
      });
    });

    it('accepts OTel native trace_id with span_id', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({
          flattened: {
            span_id: 'otel-span-2',
            trace_id: 'otel-trace-2',
          },
        }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target?.query).toEqual({
        bool: {
          filter: [
            { term: { 'span.id': 'otel-span-2' } },
            { term: { 'trace.id': 'otel-trace-2' } },
          ],
        },
      });
    });

    it('unwraps single-element arrays (ES|QL column shape)', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': ['wrapped-id'] } }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target?.query).toEqual({
        bool: {
          filter: [{ term: { 'span.id': 'wrapped-id' } }],
        },
      });
    });

    it('returns undefined when no span id is available', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'service.name': 'my-svc' } }),
        indexPattern: INDEX_PATTERN,
      });

      expect(target).toBeUndefined();
    });

    it('returns undefined when span id is present but no indexPattern is supplied', () => {
      const target = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': 'abc123' } }),
      });

      expect(target).toBeUndefined();
    });

    it('produces stable cacheKeys for the same span + index', () => {
      const a = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': 'same-span', 'trace.id': 'same-trace' } }),
        indexPattern: INDEX_PATTERN,
      });
      const b = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': 'same-span', 'trace.id': 'same-trace' } }),
        indexPattern: INDEX_PATTERN,
      });

      expect(a?.cacheKey).toBe(b?.cacheKey);
    });

    it('produces different cacheKeys for different span ids', () => {
      const a = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': 'span-A' } }),
        indexPattern: INDEX_PATTERN,
      });
      const b = getGenAiRecoveryTarget({
        hit: buildHit({ flattened: { 'span.id': 'span-B' } }),
        indexPattern: INDEX_PATTERN,
      });

      expect(a?.cacheKey).not.toBe(b?.cacheKey);
    });
  });

  it('returns undefined when no id and no indexPattern at all', () => {
    const target = getGenAiRecoveryTarget({
      hit: buildHit({}),
    });

    expect(target).toBeUndefined();
  });
});

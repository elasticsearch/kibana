/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { APMEventClient } from '@kbn/apm-data-access-plugin/server';
import { PARENT_ID, SPAN_ID, TRANSACTION_ID } from '../../../common/es_fields/apm';
import { ensureFocusedTraceHits, getTraceHitId } from './ensure_focused_trace_hits';

function createHit({ id, parentId }: { id: string; parentId?: string }): {
  fields: Record<string, unknown>;
} {
  return {
    fields: {
      [SPAN_ID]: [id],
      [TRANSACTION_ID]: [id],
      ...(parentId ? { [PARENT_ID]: [parentId] } : {}),
    },
  };
}

describe('getTraceHitId', () => {
  it('prefers span.id over transaction.id', () => {
    expect(
      getTraceHitId({
        fields: {
          [SPAN_ID]: ['span-1'],
          [TRANSACTION_ID]: ['txn-1'],
        },
      })
    ).toBe('span-1');
  });

  it('falls back to transaction.id', () => {
    expect(
      getTraceHitId({
        fields: {
          [TRANSACTION_ID]: ['txn-1'],
        },
      })
    ).toBe('txn-1');
  });
});

describe('ensureFocusedTraceHits', () => {
  const search = jest.fn();
  const apmEventClient = { search } as unknown as APMEventClient;

  beforeEach(() => {
    search.mockReset();
  });

  it('does not search when the focused document and ancestors are already present', async () => {
    const parent = createHit({ id: 'parent' });
    const focused = createHit({ id: 'focused', parentId: 'parent' });

    const result = await ensureFocusedTraceHits({
      apmEventClient,
      hits: [parent, focused],
      focusedDocId: 'focused',
      maxTraceItems: 2,
      traceId: 'trace-1',
      start: 0,
      end: 1000,
      ecsOnly: true,
    });

    expect(search).not.toHaveBeenCalled();
    expect(result.map(getTraceHitId)).toEqual(['parent', 'focused']);
  });

  it('fetches a missing focused document and drops ranked hits to stay at maxTraceItems', async () => {
    const rootA = createHit({ id: 'root-a' });
    const rootB = createHit({ id: 'root-b' });
    const focused = createHit({ id: 'focused', parentId: 'root-a' });

    search.mockResolvedValueOnce({
      hits: { hits: [focused] },
    });

    const result = await ensureFocusedTraceHits({
      apmEventClient,
      hits: [rootA, rootB],
      focusedDocId: 'focused',
      maxTraceItems: 2,
      traceId: 'trace-1',
      start: 0,
      end: 1000,
      ecsOnly: true,
    });

    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toBe('get_focused_trace_items');
    expect(result.map(getTraceHitId)).toEqual(['focused', 'root-a']);
  });

  it('walks missing ancestors after fetching the focused document', async () => {
    const rankedRoot = createHit({ id: 'other-root' });
    const parent = createHit({ id: 'parent' });
    const focused = createHit({ id: 'focused', parentId: 'parent' });

    search
      .mockResolvedValueOnce({ hits: { hits: [focused] } })
      .mockResolvedValueOnce({ hits: { hits: [parent] } });

    const result = await ensureFocusedTraceHits({
      apmEventClient,
      hits: [rankedRoot],
      focusedDocId: 'focused',
      maxTraceItems: 2,
      traceId: 'trace-1',
      start: 0,
      end: 1000,
      ecsOnly: true,
    });

    expect(search).toHaveBeenCalledTimes(2);
    expect(result.map(getTraceHitId)).toEqual(['focused', 'parent']);
  });
});

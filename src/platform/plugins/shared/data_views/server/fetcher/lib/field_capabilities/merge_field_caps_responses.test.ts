/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { estypes } from '@elastic/elasticsearch';
import { readFieldCapsResponse } from './field_caps_response';
import { mergeFieldCapsResponses } from './merge_field_caps_responses';

const capability = (
  overrides: Partial<estypes.FieldCapsFieldCapability> = {}
): estypes.FieldCapsFieldCapability => ({
  type: 'keyword',
  searchable: true,
  aggregatable: true,
  ...overrides,
});

describe('mergeFieldCapsResponses', () => {
  it('merges disjoint batches of the same field type and normalizes its coverage', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: { name: { keyword: capability() } },
      },
      {
        indices: ['index-b'],
        fields: { name: { keyword: capability() } },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false)).toEqual({
      indices: ['index-a', 'index-b'],
      fields: {
        name: {
          keyword: capability(),
        },
      },
    });
  });

  it('accounts for a field that is entirely absent from one batch', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: { name: { keyword: capability() } },
      },
      { indices: ['index-b'], fields: {} },
    ];

    expect(mergeFieldCapsResponses(responses, true).fields.name).toEqual({
      keyword: capability({ indices: ['index-a'] }),
      unmapped: capability({
        type: 'unmapped',
        searchable: false,
        aggregatable: false,
        indices: ['index-b'],
      }),
    });
    expect(mergeFieldCapsResponses(responses, false).fields.name).toEqual({
      keyword: capability(),
    });
  });

  it('does not treat an empty batch response as unmapped coverage', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: { name: { keyword: capability() } },
      },
      { indices: [], fields: {} },
    ];
    const merged = mergeFieldCapsResponses(responses, true);

    expect(merged).toEqual({
      indices: ['index-a'],
      fields: { name: { keyword: capability() } },
    });
    expect(readFieldCapsResponse(merged)).toEqual(
      readFieldCapsResponse({
        indices: ['index-a'],
        fields: { name: { keyword: capability() } },
      })
    );
  });

  it('normalizes the string form allowed by the field caps response type', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: 'index-a',
        fields: { name: { keyword: capability() } },
      },
      { indices: 'index-b', fields: {} },
    ];

    expect(mergeFieldCapsResponses(responses, true)).toEqual({
      indices: ['index-a', 'index-b'],
      fields: {
        name: {
          keyword: capability({ indices: ['index-a'] }),
          unmapped: capability({
            type: 'unmapped',
            searchable: false,
            aggregatable: false,
            indices: ['index-b'],
          }),
        },
      },
    });
  });

  it('combines explicit unmapped coverage with whole-batch absence', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a', 'index-b'],
        fields: {
          name: {
            keyword: capability({ indices: ['index-a'] }),
            unmapped: capability({
              type: 'unmapped',
              searchable: false,
              aggregatable: false,
              indices: ['index-b'],
            }),
          },
        },
      },
      { indices: ['index-c'], fields: {} },
    ];

    expect(mergeFieldCapsResponses(responses, true).fields.name.unmapped.indices).toEqual([
      'index-b',
      'index-c',
    ]);
  });

  it('preserves cross-batch field type conflicts', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: { value: { keyword: capability() } },
      },
      {
        indices: ['index-b'],
        fields: { value: { long: capability({ type: 'long' }) } },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false).fields.value).toEqual({
      keyword: capability({ indices: ['index-a'] }),
      long: capability({ type: 'long', indices: ['index-b'] }),
    });
  });

  it('recomputes searchable and aggregatable exceptions across batches', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a', 'index-b'],
        fields: {
          value: {
            keyword: capability({
              searchable: false,
              aggregatable: false,
              non_searchable_indices: ['index-b'],
              non_aggregatable_indices: ['index-b'],
            }),
          },
        },
      },
      {
        indices: ['index-b', 'index-c'],
        fields: { value: { keyword: capability() } },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false).fields.value.keyword).toEqual(
      capability({
        searchable: false,
        aggregatable: false,
        non_searchable_indices: ['index-b'],
        non_aggregatable_indices: ['index-b'],
      })
    );
  });

  it('reconstructs exceptions when one batch is uniformly false and another is true', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a', 'index-b'],
        fields: {
          value: {
            keyword: capability({ searchable: false, aggregatable: false }),
          },
        },
      },
      {
        indices: ['index-c'],
        fields: { value: { keyword: capability() } },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false).fields.value.keyword).toEqual(
      capability({
        searchable: false,
        aggregatable: false,
        non_searchable_indices: ['index-a', 'index-b'],
        non_aggregatable_indices: ['index-a', 'index-b'],
      })
    );
  });

  it('does not synthesize exception lists when all batches are uniformly false', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: {
          value: {
            keyword: capability({ searchable: false, aggregatable: false }),
          },
        },
      },
      {
        indices: ['index-b'],
        fields: {
          value: {
            keyword: capability({ searchable: false, aggregatable: false }),
          },
        },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false).fields.value.keyword).toEqual(
      capability({ searchable: false, aggregatable: false })
    );
  });

  it('deduplicates overlapping indices and merged metadata in first-seen order', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a', 'index-b'],
        fields: {
          value: {
            keyword: capability({ meta: { unit: ['ms'], source: ['first'] } }),
          },
        },
      },
      {
        indices: ['index-b', 'index-c'],
        fields: {
          value: {
            keyword: capability({
              metadata_field: true,
              meta: { unit: ['ms', 's'], source: ['second'] },
            }),
          },
        },
      },
    ];

    const merged = mergeFieldCapsResponses(responses, false);
    expect(merged.indices).toEqual(['index-a', 'index-b', 'index-c']);
    expect(merged.fields.value.keyword.meta).toEqual({
      unit: ['ms', 's'],
      source: ['first', 'second'],
    });
    expect(merged.fields.value.keyword.metadata_field).toBe(true);
  });

  it('preserves time-series dimension and metric conflicts across batches', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: {
          value: {
            long: capability({
              type: 'long',
              time_series_dimension: true,
              time_series_metric: 'gauge',
            }),
          },
        },
      },
      {
        indices: ['index-b'],
        fields: {
          value: {
            long: capability({ type: 'long', time_series_metric: 'counter' }),
          },
        },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false).fields.value.long).toEqual(
      capability({
        type: 'long',
        time_series_dimension: true,
        non_dimension_indices: ['index-b'],
        metric_conflicts_indices: ['index-a', 'index-b'],
      })
    );
  });

  it('preserves pre-existing time-series conflict indices', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a', 'index-b'],
        fields: {
          value: {
            long: capability({
              type: 'long',
              non_dimension_indices: ['index-b'],
              metric_conflicts_indices: ['index-a', 'index-b'],
            }),
          },
        },
      },
    ];

    expect(mergeFieldCapsResponses(responses, false).fields.value.long).toEqual(
      capability({
        type: 'long',
        time_series_dimension: true,
        non_dimension_indices: ['index-b'],
        metric_conflicts_indices: ['index-a', 'index-b'],
      })
    );
  });

  it('does not mutate its input responses', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: {
          value: { keyword: capability({ meta: { unit: ['ms'] } }) },
        },
      },
      { indices: ['index-b'], fields: {} },
    ];
    const before = structuredClone(responses);

    mergeFieldCapsResponses(responses, false);

    expect(responses).toEqual(before);
  });

  it('produces the same data view fields as the equivalent single response', () => {
    const responses: estypes.FieldCapsResponse[] = [
      {
        indices: ['index-a'],
        fields: { name: { keyword: capability() } },
      },
      {
        indices: ['index-b'],
        fields: { name: { keyword: capability() } },
      },
    ];
    const singleResponse: estypes.FieldCapsResponse = {
      indices: ['index-a', 'index-b'],
      fields: { name: { keyword: capability() } },
    };

    expect(readFieldCapsResponse(mergeFieldCapsResponses(responses, false))).toEqual(
      readFieldCapsResponse(singleResponse)
    );
  });
});

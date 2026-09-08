/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseFacetsFromAggregations } from './saved_object_content_storage';
import type { SearchQuery } from '@kbn/content-management-plugin/common';

describe('parseFacetsFromAggregations', () => {
  it('should return undefined when no aggregations provided', () => {
    const result = parseFacetsFromAggregations(undefined, { tags: {} });
    expect(result).toBeUndefined();
  });

  it('should return undefined when no facets requested', () => {
    const result = parseFacetsFromAggregations({ tags: {} }, undefined);
    expect(result).toBeUndefined();
  });

  it('should parse tag facets', () => {
    const aggregations = {
      tags: {
        filtered_tags: {
          tag_ids: {
            buckets: [
              { key: 'tag1', doc_count: 5 },
              { key: 'tag2', doc_count: 3 },
              { key: 'tag3', doc_count: 1 },
            ],
          },
        },
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      tags: { size: 10 },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toEqual({
      tags: [
        { key: 'tag1', doc_count: 5 },
        { key: 'tag2', doc_count: 3 },
        { key: 'tag3', doc_count: 1 },
      ],
    });
  });

  it('should parse createdBy facets', () => {
    const aggregations = {
      created_by: {
        buckets: [
          { key: 'user1', doc_count: 10 },
          { key: 'user2', doc_count: 7 },
        ],
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      createdBy: { size: 10 },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toEqual({
      createdBy: [
        { key: 'user1', doc_count: 10 },
        { key: 'user2', doc_count: 7 },
      ],
    });
  });

  it('should parse both tag and createdBy facets', () => {
    const aggregations = {
      tags: {
        filtered_tags: {
          tag_ids: {
            buckets: [{ key: 'tag1', doc_count: 5 }],
          },
        },
      },
      created_by: {
        buckets: [{ key: 'user1', doc_count: 10 }],
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      tags: { size: 10 },
      createdBy: { size: 10 },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toEqual({
      tags: [{ key: 'tag1', doc_count: 5 }],
      createdBy: [{ key: 'user1', doc_count: 10 }],
    });
  });

  it('should include missing tags when requested', () => {
    const aggregations = {
      tags: {
        filtered_tags: {
          tag_ids: {
            buckets: [{ key: 'tag1', doc_count: 5 }],
          },
        },
      },
      missing_tags: {
        doc_count: 2,
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      tags: { size: 10, includeMissing: true },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toEqual({
      tags: [
        { key: 'tag1', doc_count: 5 },
        { key: '__missing__', doc_count: 2 },
      ],
    });
  });

  it('should include missing createdBy when requested', () => {
    const aggregations = {
      created_by: {
        buckets: [{ key: 'user1', doc_count: 10 }],
      },
      missing_created_by: {
        doc_count: 3,
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      createdBy: { size: 10, includeMissing: true },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toEqual({
      createdBy: [
        { key: 'user1', doc_count: 10 },
        { key: '__missing__', doc_count: 3 },
      ],
    });
  });

  it('should handle empty buckets', () => {
    const aggregations = {
      tags: {
        filtered_tags: {
          tag_ids: {
            buckets: [],
          },
        },
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      tags: { size: 10 },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toEqual({
      tags: [],
    });
  });

  it('should return undefined when no valid facets are parsed', () => {
    const aggregations = {
      other_agg: {
        value: 100,
      },
    };

    const facetsRequested: SearchQuery['facets'] = {
      tags: { size: 10 },
    };

    const result = parseFacetsFromAggregations(aggregations, facetsRequested);

    expect(result).toBeUndefined();
  });
});

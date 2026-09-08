/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { searchArgsToSOFindOptionsDefault } from './saved_object_content_storage';
import type { SearchQuery } from '@kbn/content-management-plugin/common';

describe('searchArgsToSOFindOptionsDefault', () => {
  const baseQuery: SearchQuery = {
    text: 'test query',
    limit: 10,
  };

  const baseParams = {
    contentTypeId: 'test-type',
    query: baseQuery,
    options: {
      searchFields: ['title', 'description'],
      fields: ['title', 'description'],
    },
  };

  it('should convert basic search parameters', () => {
    const result = searchArgsToSOFindOptionsDefault(baseParams);

    expect(result).toEqual({
      type: 'test-type',
      search: 'test query',
      perPage: 10,
      page: undefined,
      defaultSearchOperator: 'AND',
      searchFields: ['title', 'description'],
      fields: ['title', 'description'],
    });
  });

  it('should handle cursor pagination', () => {
    const result = searchArgsToSOFindOptionsDefault({
      ...baseParams,
      query: { ...baseQuery, cursor: '2' },
    });

    expect(result.page).toBe(2);
  });

  describe('sorting', () => {
    it('should pass sort field and direction when provided', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          sort: {
            field: 'title',
            direction: 'asc',
          },
        },
      });

      expect(result.sortField).toBe('title');
      expect(result.sortOrder).toBe('asc');
    });

    it('should handle descending sort order', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          sort: {
            field: 'updatedAt',
            direction: 'desc',
          },
        },
      });

      expect(result.sortField).toBe('updatedAt');
      expect(result.sortOrder).toBe('desc');
    });

    it('should not add sort fields when sort is not provided', () => {
      const result = searchArgsToSOFindOptionsDefault(baseParams);

      expect(result.sortField).toBeUndefined();
      expect(result.sortOrder).toBeUndefined();
    });

    it('should handle common sort fields', () => {
      const sortFields = ['title', 'updatedAt', 'createdAt'];

      sortFields.forEach((field) => {
        const result = searchArgsToSOFindOptionsDefault({
          ...baseParams,
          query: {
            ...baseQuery,
            sort: {
              field,
              direction: 'asc',
            },
          },
        });

        expect(result.sortField).toBe(field);
        expect(result.sortOrder).toBe('asc');
      });
    });
  });

  describe('tags', () => {
    it('should handle included tags', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          tags: {
            included: ['tag1', 'tag2'],
          },
        },
      });

      expect(result.hasReference).toEqual([
        { id: 'tag1', type: 'tag' },
        { id: 'tag2', type: 'tag' },
      ]);
    });

    it('should handle excluded tags', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          tags: {
            excluded: ['tag3', 'tag4'],
          },
        },
      });

      expect(result.hasNoReference).toEqual([
        { id: 'tag3', type: 'tag' },
        { id: 'tag4', type: 'tag' },
      ]);
    });
  });

  describe('createdBy filtering', () => {
    it('should build KQL filter for single included user', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            included: ['user1'],
          },
        },
      });

      expect(result.filter).toBe('(created_by:"user1")');
    });

    it('should build KQL filter for multiple included users with OR logic', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            included: ['user1', 'user2', 'user3'],
          },
        },
      });

      expect(result.filter).toBe(
        '(created_by:"user1" OR created_by:"user2" OR created_by:"user3")'
      );
    });

    it('should build KQL filter for excluded users', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            excluded: ['user4'],
          },
        },
      });

      expect(result.filter).toBe('NOT created_by:"user4"');
    });

    it('should build KQL filter for multiple excluded users with AND logic', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            excluded: ['user4', 'user5'],
          },
        },
      });

      expect(result.filter).toBe('NOT created_by:"user4" AND NOT created_by:"user5"');
    });

    it('should handle includeNoCreator flag', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            includeNoCreator: true,
          },
        },
      });

      expect(result.filter).toBe('(NOT created_by:*)');
    });

    it('should combine included users with includeNoCreator using OR logic', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            included: ['user1', 'user2'],
            includeNoCreator: true,
          },
        },
      });

      expect(result.filter).toBe('(created_by:"user1" OR created_by:"user2" OR NOT created_by:*)');
    });

    it('should combine included and excluded users', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          createdBy: {
            included: ['user1'],
            excluded: ['user2'],
          },
        },
      });

      expect(result.filter).toBe('(created_by:"user1") AND NOT created_by:"user2"');
    });

    it('should not add filter when createdBy is not provided', () => {
      const result = searchArgsToSOFindOptionsDefault(baseParams);

      expect(result.filter).toBeUndefined();
    });
  });

  describe('favorites filtering', () => {
    it('should handle favorites with IDs', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          favorites: {
            only: true,
            ids: ['fav1', 'fav2', 'fav3'],
          },
        },
      });

      expect(result.hasReference).toEqual([
        { type: 'favorite', id: 'fav1' },
        { type: 'favorite', id: 'fav2' },
        { type: 'favorite', id: 'fav3' },
      ]);
    });

    it('should handle empty favorites list by returning no-match filter', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          favorites: {
            only: true,
            ids: [],
          },
        },
      });

      expect(result.hasReference).toEqual([{ type: '__invalid__', id: '__no_match__' }]);
    });

    it('should not add favorites filter when only is false', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          favorites: {
            only: false,
            ids: ['fav1', 'fav2'],
          },
        },
      });

      expect(result.hasReference).toBeUndefined();
    });

    it('should not add favorites filter when favorites is not provided', () => {
      const result = searchArgsToSOFindOptionsDefault(baseParams);

      expect(result.hasReference).toBeUndefined();
    });
  });

  describe('combined filters', () => {
    it('should handle tags and createdBy together', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          tags: {
            included: ['tag1'],
          },
          createdBy: {
            included: ['user1'],
          },
        },
      });

      expect(result.hasReference).toEqual([{ id: 'tag1', type: 'tag' }]);
      expect(result.filter).toBe('(created_by:"user1")');
    });

    it('should handle sort, createdBy, and tags together', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          sort: {
            field: 'title',
            direction: 'asc',
          },
          tags: {
            included: ['tag1'],
          },
          createdBy: {
            included: ['user1'],
          },
        },
      });

      expect(result.sortField).toBe('title');
      expect(result.sortOrder).toBe('asc');
      expect(result.hasReference).toEqual([{ id: 'tag1', type: 'tag' }]);
      expect(result.filter).toBe('(created_by:"user1")');
    });

    it('should combine tags and favorites hasReference arrays', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          tags: {
            included: ['tag1', 'tag2'],
          },
          favorites: {
            only: true,
            ids: ['fav1', 'fav2'],
          },
        },
      });

      expect(result.hasReference).toEqual([
        { id: 'tag1', type: 'tag' },
        { id: 'tag2', type: 'tag' },
        { type: 'favorite', id: 'fav1' },
        { type: 'favorite', id: 'fav2' },
      ]);
    });
  });

  describe('facets', () => {
    it('should add aggregations for tag facets', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          facets: {
            tags: {
              size: 15,
            },
          },
        },
      });

      expect(result.aggs).toBeDefined();
      expect(result.aggs?.tags).toBeDefined();
      expect(result.aggs?.tags?.nested?.path).toBe('test-type.references');
    });

    it('should add aggregations for createdBy facets', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          facets: {
            createdBy: {
              size: 20,
            },
          },
        },
      });

      expect(result.aggs).toBeDefined();
      expect(result.aggs?.created_by).toBeDefined();
      expect(result.aggs?.created_by?.terms?.field).toBe('created_by');
      expect(result.aggs?.created_by?.terms?.size).toBe(20);
    });

    it('should add aggregations for both tag and createdBy facets', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          facets: {
            tags: {
              size: 10,
            },
            createdBy: {
              size: 10,
            },
          },
        },
      });

      expect(result.aggs).toBeDefined();
      expect(result.aggs?.tags).toBeDefined();
      expect(result.aggs?.created_by).toBeDefined();
    });

    it('should handle includeMissing for tag facets', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          facets: {
            tags: {
              size: 10,
              includeMissing: true,
            },
          },
        },
      });

      expect(result.aggs).toBeDefined();
      expect(result.aggs?.tags).toBeDefined();
      expect(result.aggs?.missing_tags).toBeDefined();
      expect(result.aggs?.missing_tags?.missing?.field).toBe('test-type.references');
    });

    it('should handle includeMissing for createdBy facets', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          facets: {
            createdBy: {
              size: 10,
              includeMissing: true,
            },
          },
        },
      });

      expect(result.aggs).toBeDefined();
      expect(result.aggs?.created_by).toBeDefined();
      expect(result.aggs?.missing_created_by).toBeDefined();
      expect(result.aggs?.missing_created_by?.missing?.field).toBe('created_by');
    });

    it('should not add aggregations when facets are not requested', () => {
      const result = searchArgsToSOFindOptionsDefault(baseParams);

      expect(result.aggs).toBeUndefined();
    });

    it('should use default size of 10 when not specified', () => {
      const result = searchArgsToSOFindOptionsDefault({
        ...baseParams,
        query: {
          ...baseQuery,
          facets: {
            tags: {},
          },
        },
      });

      expect(result.aggs).toBeDefined();
      expect(result.aggs?.tags?.aggs?.filtered_tags?.aggs?.tag_ids?.terms?.size).toBe(10);
    });
  });
});

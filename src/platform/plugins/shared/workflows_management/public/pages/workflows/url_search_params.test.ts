/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  parseBooleanFilterValue,
  parseWorkflowsUrlSearchParams,
  serializeWorkflowsUrlSearchParams,
} from './url_search_params';
import { WORKFLOWS_TABLE_INITIAL_PAGE_SIZE } from '../../features/workflow_list/constants';

describe('workflows URL search params', () => {
  describe('parseBooleanFilterValue', () => {
    it('parses boolean filter values from normalized strings', () => {
      expect(parseBooleanFilterValue('true')).toBe(true);
      expect(parseBooleanFilterValue(' false ')).toBe(false);
    });

    it('returns undefined for invalid boolean filter values', () => {
      expect(parseBooleanFilterValue('maybe')).toBeUndefined();
    });
  });

  describe('parseWorkflowsUrlSearchParams', () => {
    it('returns default list params when the URL has no search params', () => {
      expect(parseWorkflowsUrlSearchParams('')).toEqual({
        size: WORKFLOWS_TABLE_INITIAL_PAGE_SIZE,
        page: 1,
        query: '',
      });
    });

    it('restores workflow list filters from URL search params', () => {
      const params = new URLSearchParams([
        ['query', 'security'],
        ['page', '3'],
        ['size', '50'],
        ['enabled', 'true'],
        ['enabled', 'false'],
        ['enabled', 'invalid'],
        ['createdBy', 'user-1'],
        ['createdBy', 'user-2'],
        ['tags', 'prod'],
        ['tags', 'critical'],
        ['sortField', 'enabled'],
        ['sortOrder', 'desc'],
        ['managed', 'all'],
      ]);

      expect(parseWorkflowsUrlSearchParams(params.toString())).toEqual({
        size: 50,
        page: 3,
        query: 'security',
        enabled: [true, false],
        createdBy: ['user-1', 'user-2'],
        tags: ['prod', 'critical'],
        sortField: 'enabled',
        sortOrder: 'desc',
        managed: 'all',
      });
    });

    it('ignores invalid URL values', () => {
      const params = new URLSearchParams([
        ['page', '0'],
        ['size', '-1'],
        ['enabled', 'maybe'],
        ['sortField', 'createdAt'],
        ['sortOrder', 'up'],
        ['managed', 'system'],
      ]);

      expect(parseWorkflowsUrlSearchParams(params.toString())).toEqual({
        size: WORKFLOWS_TABLE_INITIAL_PAGE_SIZE,
        page: 1,
        query: '',
      });
    });
  });

  describe('serializeWorkflowsUrlSearchParams', () => {
    it('omits defaults from the serialized URL search params', () => {
      expect(
        serializeWorkflowsUrlSearchParams({
          size: WORKFLOWS_TABLE_INITIAL_PAGE_SIZE,
          page: 1,
          query: '',
          managed: 'unmanaged',
        })
      ).toBe('');
    });

    it('serializes workflow list filters to URL search params', () => {
      const params = new URLSearchParams(
        serializeWorkflowsUrlSearchParams({
          size: 50,
          page: 3,
          query: 'security',
          enabled: [true, false],
          createdBy: ['user-1', 'user-2'],
          tags: ['prod', 'critical'],
          sortField: 'name',
          sortOrder: 'asc',
          managed: 'managed',
        })
      );

      expect(params.get('query')).toBe('security');
      expect(params.get('page')).toBe('3');
      expect(params.get('size')).toBe('50');
      expect(params.getAll('enabled')).toEqual(['true', 'false']);
      expect(params.getAll('createdBy')).toEqual(['user-1', 'user-2']);
      expect(params.getAll('tags')).toEqual(['prod', 'critical']);
      expect(params.get('sortField')).toBe('name');
      expect(params.get('sortOrder')).toBe('asc');
      expect(params.get('managed')).toBe('managed');
    });

    it('omits unmanaged as the default managed filter', () => {
      expect(
        new URLSearchParams(serializeWorkflowsUrlSearchParams({ managed: 'unmanaged' })).has(
          'managed'
        )
      ).toBe(false);
    });
  });
});

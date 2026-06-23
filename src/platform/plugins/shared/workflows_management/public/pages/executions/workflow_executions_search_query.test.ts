/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  buildWorkflowExecutionsSearchFilters,
  getWorkflowExecutionsFetchErrorMessage,
} from './workflow_executions_search_query';

describe('workflow_executions_search_query', () => {
  describe('buildWorkflowExecutionsSearchFilters', () => {
    it('includes user filters, space, step-run exclusion, and time range', () => {
      const userFilters = [
        {
          meta: { alias: 'status filter', disabled: false },
          query: { term: { status: 'completed' } },
        },
      ];

      const filters = buildWorkflowExecutionsSearchFilters({
        spaceId: 'default',
        timeRange: { from: 'now-24h', to: 'now' },
        timeField: 'startedAt',
        userFilters,
      });

      expect(filters).toHaveLength(4);
      expect(filters[0]).toBe(userFilters[0]);
      expect(filters[1].query).toEqual({
        bool: {
          should: [
            { term: { spaceId: 'default' } },
            { bool: { must_not: { exists: { field: 'spaceId' } } } },
          ],
          minimum_should_match: 1,
        },
      });
      expect(filters[2].query).toEqual({
        bool: {
          must_not: { exists: { field: 'stepId' } },
        },
      });
      expect(filters[3].query).toEqual({
        range: {
          startedAt: {
            gte: 'now-24h',
            lte: 'now',
            format: 'strict_date_optional_time',
          },
        },
      });
    });
  });

  describe('getWorkflowExecutionsFetchErrorMessage', () => {
    it('returns a generic message', () => {
      expect(getWorkflowExecutionsFetchErrorMessage()).toBe('Failed to load executions');
    });
  });
});

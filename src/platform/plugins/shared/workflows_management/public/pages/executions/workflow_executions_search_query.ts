/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { Filter, TimeRange } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';

const buildSpaceFilterQuery = (spaceId: string): QueryDslQueryContainer => ({
  bool: {
    should: [{ term: { spaceId } }, { bool: { must_not: { exists: { field: 'spaceId' } } } }],
    minimum_should_match: 1,
  },
});

const buildOmitStepRunsFilterQuery = (): QueryDslQueryContainer => ({
  bool: {
    must_not: { exists: { field: 'stepId' } },
  },
});

const buildTimeRangeFilter = (timeRange: TimeRange, timeField: string): Filter => ({
  query: {
    range: {
      [timeField]: {
        gte: timeRange.from,
        lte: timeRange.to,
        format: 'strict_date_optional_time',
      },
    },
  },
  meta: {
    type: 'custom',
  },
});

export const buildWorkflowExecutionsSearchFilters = ({
  spaceId,
  timeRange,
  timeField,
  userFilters,
}: {
  spaceId: string;
  timeRange: TimeRange;
  timeField: string;
  userFilters: Filter[];
}): Filter[] => [
  ...userFilters,
  {
    meta: { type: 'custom', disabled: false },
    query: buildSpaceFilterQuery(spaceId),
  },
  {
    meta: { type: 'custom', disabled: false },
    query: buildOmitStepRunsFilterQuery(),
  },
  buildTimeRangeFilter(timeRange, timeField),
];

export const getWorkflowExecutionsFetchErrorMessage = (): string =>
  i18n.translate('workflowsManagement.executionsPage.fetchError', {
    defaultMessage: 'Failed to load executions',
  });

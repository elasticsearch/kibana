/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleQuery } from '../../form/types';

const FROM_QUERY_PATTERN = /^\s*FROM\s+[a-zA-Z0-9_.*-]/i;

/**
 * Returns the ES|QL query used to resolve index date fields for time-field
 * selection. Uses the base query in alert (tracking) mode and the full breach
 * query in signal mode. Empty when the query is not committed or has no FROM.
 */
export function getTimeFieldResolutionQuery(
  query: RuleQuery,
  isAlert: boolean,
  queryCommitted: boolean
): string {
  const baseQuery = query.format === 'composed' ? query.base : '';
  const fullQuery = query.format === 'standalone' ? query.breach.query : '';
  const candidate = isAlert ? baseQuery : fullQuery;
  return FROM_QUERY_PATTERN.test(candidate) && queryCommitted ? candidate : '';
}

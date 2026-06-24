/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse, Query } from '@kbn/alerting-v2-schemas';
import type { RuleQuery } from '../types';

/**
 * Maps form `RuleQuery` to the API `Query` shape.
 */
export const ruleQueryToApiQuery = (query: RuleQuery): Query => {
  if (query.format === 'composed') {
    return {
      format: 'composed',
      base: query.base,
      breach: { segment: query.breach.segment },
      ...(query.recovery ? { recovery: { segment: query.recovery.segment } } : {}),
    };
  }
  return {
    format: 'standalone',
    breach: { query: query.breach.query },
    ...(query.recovery ? { recovery: { query: query.recovery.query } } : {}),
    ...(query.no_data ? { no_data: { query: query.no_data.query } } : {}),
  };
};

/**
 * Maps an API `Query` response back to the form's `RuleQuery`. Recovery is
 * only included when `recovery_strategy` is `'query'`.
 */
export const apiQueryToFormQuery = (
  q: RuleResponse['query'],
  recoveryStrategy?: RuleResponse['recovery_strategy']
): RuleQuery => {
  if (q.format === 'composed') {
    return {
      format: 'composed',
      base: q.base,
      breach: { segment: q.breach.segment },
      ...(recoveryStrategy === 'query' && q.recovery
        ? { recovery: { segment: q.recovery.segment } }
        : {}),
    };
  }
  return {
    format: 'standalone',
    breach: { query: q.breach.query },
    ...(recoveryStrategy === 'query' && q.recovery
      ? { recovery: { query: q.recovery.query } }
      : {}),
    ...(q.no_data ? { no_data: { query: q.no_data.query } } : {}),
  };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '@kbn/alerting-v2-schemas';

/**
 * Determines whether a rule (from the API response) contains features that
 * the GUI form cannot represent. Such rules must be edited in YAML mode only.
 *
 * Non-representable cases:
 * - `alert` kind with `standalone` query format (form requires composed base+segments)
 * - `recovery_strategy` other than `'query'` (form only supports custom recovery queries)
 * - `no_data_strategy` set to any active value (form has no UI for no-data handling)
 *
 * Note: `query.no_data` is not checked separately because it can only appear on
 * standalone format queries, which the `format === 'standalone'` check already catches.
 */
export const isNonRepresentableRule = (rule: RuleResponse): boolean => {
  if (rule.kind !== 'alert') return false;

  if (rule.query.format === 'standalone') return true;

  if (rule.recovery_strategy != null && rule.recovery_strategy !== 'query') {
    return true;
  }

  if (rule.no_data_strategy != null && rule.no_data_strategy !== 'none') {
    return true;
  }

  return false;
};

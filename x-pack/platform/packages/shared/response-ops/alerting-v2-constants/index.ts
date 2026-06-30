/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export * from './src';

export const ALERTING_V2_RULE_API_PATH = '/api/alerting/v2/rules' as const;
export const ALERTING_V2_ALERT_API_PATH = '/api/alerting/v2/alerts' as const;
export const ALERTING_V2_ACTION_POLICY_API_PATH = '/api/alerting/v2/action_policies' as const;
export const ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH =
  '/api/alerting/v2/action_policies/execution_history' as const;
export const ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_COUNT_API_PATH =
  '/api/alerting/v2/action_policies/execution_history/_count_since' as const;
export const ALERTING_V2_EXECUTION_HISTORY_RULES_API_PATH =
  '/api/alerting/v2/execution_history/rules' as const;
export const ALERTING_V2_MATCHER_VALUE_SUGGESTIONS_API_PATH =
  '/internal/action_policies/suggestions/values' as const;
export const ALERTING_V2_INTERNAL_SUGGEST_USER_PROFILES_API_PATH =
  '/internal/alerting/v2/user_profiles/_suggest' as const;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const COMMON_HEADERS = {
  'kbn-xsrf': 'some-xsrf-token',
  'x-elastic-internal-origin': 'kibana',
  'Content-Type': 'application/json;charset=UTF-8',
} as const;

export const SCHEDULE_INTERVAL = '5s';
export const LOOKBACK_WINDOW = '1m';
export const POLL_TIMEOUT_MS = 45_000;
export const POLL_INTERVAL_MS = 1_000;

export const ACTION_POLICY_PER_PAGE_MAX = 100;
export const ACTION_POLICY_SEARCH_MAX_LENGTH = 256;
export const ACTION_POLICY_TAGS_MAX_COUNT = 10;
export const ACTION_POLICY_TAG_MAX_LENGTH = 128;

export { RULE_TEMPLATE_MAX_PER_PAGE as RULE_TEMPLATE_PER_PAGE_MAX } from '@kbn/alerting-v2-schemas';

export { MAX_TAGS as RULE_TEMPLATE_TAGS_MAX_COUNT } from '@kbn/alerting-v2-constants';
export {
  ALERTING_V2_RULE_API_PATH as RULE_API_PATH,
  ALERTING_V2_ALERT_API_PATH as ALERT_API_PATH,
  ALERTING_V2_SERIES_API_PATH as SERIES_API_PATH,
  ALERTING_V2_EPISODES_API_PATH as EPISODES_API_PATH,
  ALERTING_V2_ACTION_POLICY_API_PATH as ACTION_POLICY_API_PATH,
  ALERTING_V2_ACTION_POLICY_EXECUTION_HISTORY_API_PATH as EXECUTION_HISTORY_API_PATH,
  ALERTING_V2_EXECUTION_HISTORY_RULES_API_PATH as RULE_EXECUTIONS_API_PATH,
  ALERTING_V2_INTERNAL_RULE_TEMPLATE_API_PATH as RULE_TEMPLATE_API_PATH,
} from '@kbn/alerting-v2-constants';
export { RULE_TEMPLATE_SAVED_OBJECT_TYPE } from '../../../common/saved_object_types';

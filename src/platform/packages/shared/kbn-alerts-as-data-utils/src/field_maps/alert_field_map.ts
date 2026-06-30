/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  ALERT_ACTION_GROUP,
  ALERT_CASE_IDS,
  ALERT_DURATION,
  ALERT_END,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_PENDING_RECOVERED_COUNT,
  ALERT_INSTANCE_ID,
  ALERT_LAST_DETECTED,
  ALERT_PREVIOUS_ACTION_GROUP,
  ALERT_REASON,
  ALERT_RULE_CATEGORY,
  ALERT_RULE_CONSUMER,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_RULE_EXECUTION_TYPE,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_NAME,
  ALERT_RULE_PARAMETERS,
  ALERT_RULE_PRODUCER,
  ALERT_RULE_REVISION,
  ALERT_RULE_TAGS,
  ALERT_RULE_TYPE_ID,
  ALERT_RULE_UUID,
  ALERT_SEVERITY,
  ALERT_SEVERITY_IMPROVING,
  ALERT_START,
  ALERT_STATUS,
  ALERT_TIME_RANGE,
  ALERT_UPDATED_AT,
  ALERT_UPDATED_BY_USER_ID,
  ALERT_UPDATED_BY_USER_NAME,
  ALERT_URL,
  ALERT_UUID,
  ALERT_WORKFLOW_ASSIGNEE_IDS,
  ALERT_WORKFLOW_STATUS,
  ALERT_WORKFLOW_TAGS,
  SPACE_IDS,
  CPS_SCOPE_EXPRESSION,
  CPS_SCOPE_LINKED_PROJECTS,
  TIMESTAMP,
  VERSION,
  EVENT_ACTION,
  EVENT_KIND,
  EVENT_ORIGINAL,
  TAGS,
  ALERT_INTENDED_TIMESTAMP,
  ALERT_INDEX_PATTERN,
  ALERT_SCHEDULED_ACTION_GROUP,
  ALERT_SCHEDULED_ACTION_DATE,
  ALERT_SCHEDULED_ACTION_THROTTLING,
  ALERT_MUTED,
  ALERT_SNOOZED,
  ALERT_STATE_NAMESPACE,
} from '@kbn/rule-data-utils';
import type { MultiField } from './types';

// ECS defines data_stream.* as constant_keyword, but alerts need them as regular keyword
// since constant_keyword is excluded from ecsFieldMap (causes composite mapping conflicts).
const DATA_STREAM_DATASET = 'data_stream.dataset' as const;
const DATA_STREAM_NAMESPACE = 'data_stream.namespace' as const;
const DATA_STREAM_TYPE = 'data_stream.type' as const;

export const alertFieldMap = {
  [ALERT_ACTION_GROUP]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_CASE_IDS]: {
    type: 'keyword',
    array: true,
    required: false,
  },
  [ALERT_DURATION]: {
    type: 'long',
    array: false,
    required: false,
  },
  [ALERT_END]: {
    type: 'date',
    array: false,
    required: false,
  },
  [ALERT_FLAPPING]: {
    type: 'boolean',
    array: false,
    required: false,
  },
  [ALERT_FLAPPING_HISTORY]: {
    type: 'boolean',
    array: true,
    required: false,
  },
  [ALERT_MAINTENANCE_WINDOW_IDS]: {
    type: 'keyword',
    array: true,
    required: false,
  },
  [ALERT_MAINTENANCE_WINDOW_NAMES]: {
    type: 'keyword',
    array: true,
    required: false,
  },
  [ALERT_CONSECUTIVE_MATCHES]: {
    type: 'long',
    array: false,
    required: false,
  },
  [ALERT_PENDING_RECOVERED_COUNT]: {
    type: 'long',
    array: false,
    required: false,
  },
  [ALERT_INSTANCE_ID]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_LAST_DETECTED]: {
    type: 'date',
    required: false,
    array: false,
  },
  [ALERT_PREVIOUS_ACTION_GROUP]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_REASON]: {
    type: 'keyword',
    array: false,
    required: false,
    multi_fields: [
      {
        flat_name: `${ALERT_REASON}.text`,
        name: 'text',
        type: 'match_only_text',
      },
    ] as MultiField[],
  },
  [ALERT_RULE_CATEGORY]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_RULE_CONSUMER]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_RULE_EXECUTION_TIMESTAMP]: {
    type: 'date',
    array: false,
    required: false,
  },
  [ALERT_RULE_EXECUTION_TYPE]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_INTENDED_TIMESTAMP]: {
    type: 'date',
    array: false,
    required: false,
  },
  [ALERT_RULE_EXECUTION_UUID]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_RULE_NAME]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_RULE_PARAMETERS]: {
    array: false,
    type: 'flattened',
    ignore_above: 4096,
    required: false,
  },
  [ALERT_RULE_PRODUCER]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_RULE_REVISION]: {
    type: 'long',
    array: false,
    required: true,
  },
  [ALERT_RULE_TAGS]: {
    type: 'keyword',
    array: true,
    required: false,
  },
  [ALERT_RULE_TYPE_ID]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_RULE_UUID]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_SEVERITY]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_SEVERITY_IMPROVING]: {
    type: 'boolean',
    array: false,
    required: false,
  },
  [ALERT_START]: {
    type: 'date',
    array: false,
    required: false,
  },
  [ALERT_STATUS]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_TIME_RANGE]: {
    type: 'date_range',
    format: 'epoch_millis||strict_date_optional_time',
    array: false,
    required: false,
  },
  [ALERT_UPDATED_AT]: {
    type: 'date',
    array: false,
    required: false,
  },
  [ALERT_UPDATED_BY_USER_ID]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_UPDATED_BY_USER_NAME]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_URL]: {
    type: 'keyword',
    array: false,
    index: false,
    required: false,
    ignore_above: 2048,
  },
  [ALERT_UUID]: {
    type: 'keyword',
    array: false,
    required: true,
  },
  [ALERT_WORKFLOW_STATUS]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_WORKFLOW_TAGS]: {
    type: 'keyword',
    array: true,
    required: false,
  },
  [ALERT_WORKFLOW_ASSIGNEE_IDS]: {
    type: 'keyword',
    array: true,
    required: false,
  },
  [ALERT_SCHEDULED_ACTION_DATE]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_SCHEDULED_ACTION_GROUP]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_SCHEDULED_ACTION_THROTTLING]: {
    type: 'unmapped',
    required: false,
  },
  // ignore_above values must match ECS definitions to prevent composite mapping conflicts
  [EVENT_ACTION]: {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  [EVENT_KIND]: {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 1024,
  },
  // 32766 is Lucene's max term byte length - prevents "immense term" indexing errors
  [EVENT_ORIGINAL]: {
    type: 'keyword',
    array: false,
    required: false,
    ignore_above: 32766,
  },
  [DATA_STREAM_TYPE]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [DATA_STREAM_DATASET]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [DATA_STREAM_NAMESPACE]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [SPACE_IDS]: {
    type: 'keyword',
    array: true,
    required: true,
  },
  [CPS_SCOPE_EXPRESSION]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [CPS_SCOPE_LINKED_PROJECTS]: {
    type: 'flattened',
    array: true,
    required: false,
  },
  // ignore_above: 1024 matches ECS definition to prevent composite mapping conflicts
  [TAGS]: {
    type: 'keyword',
    array: true,
    required: false,
    ignore_above: 1024,
  },
  [TIMESTAMP]: {
    type: 'date',
    required: true,
    array: false,
  },
  [VERSION]: {
    type: 'version',
    array: false,
    required: false,
  },
  [ALERT_INDEX_PATTERN]: {
    type: 'keyword',
    array: false,
    required: false,
  },
  [ALERT_MUTED]: {
    type: 'boolean',
    array: false,
    required: false,
  },
  [ALERT_SNOOZED]: {
    type: 'boolean',
    array: false,
    required: false,
  },
  [ALERT_STATE_NAMESPACE]: {
    type: 'unmapped',
    array: false,
    required: false,
  },
} as const;

export type AlertFieldMap = typeof alertFieldMap;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataViewSpec } from '@kbn/data-views-plugin/common';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { RuleExecutionView } from '@kbn/alerting-v2-schemas';
import {
  COLUMN_TIMESTAMP,
  RULES_COLUMN_RULE,
  RULES_COLUMN_DURATION,
  RULES_COLUMN_RESPONSE,
  RULES_COLUMN_MESSAGE,
} from '../translations';
import { displayField, useAdHocDataView } from './create_ad_hoc_data_view';

// Direct fields reuse the payload's own (snake_case) key, tied to the schema so a top-level rename
// in `@kbn/alerting-v2-schemas` is a compile error here (drift guard).
const DIRECT_FIELDS = {
  startedAt: 'started_at',
  outcome: 'outcome',
} as const satisfies Record<string, keyof RuleExecutionView>;

// Field (column) ids for the rule executions ad-hoc data view. Nested (`rule.id`), unit-converted
// (`timings.duration`) and computed (combined `message`) columns don't map 1:1 to a top-level
// payload field, so they get a flat display id instead of mirroring the payload path; their drift
// is caught in the row-mapping step. Direct fields keep the payload key (see DIRECT_FIELDS).
export const RULE_EXECUTION_FIELDS = {
  startedAt: DIRECT_FIELDS.startedAt,
  ruleId: 'rule_id',
  duration: 'duration',
  outcome: DIRECT_FIELDS.outcome,
  message: 'message',
} as const;

// In-memory data view — the `title` does not resolve to any real index. Declaring the timestamp
// as a regular field (rather than `timeFieldName`) keeps it a normal, explicitly-rendered column
// and prevents `UnifiedDataTable` from injecting its own duplicate time column.
const RULE_EXECUTIONS_DATA_VIEW_SPEC: DataViewSpec = {
  id: 'alerting-v2-rule-executions',
  title: 'alerting-v2-rule-executions',
  fields: {
    // Only started_at and duration are sortable — the Rules API supports server-side sort on those
    // two fields only (see rule_execution_history_schema `sort` enum).
    [RULE_EXECUTION_FIELDS.startedAt]: displayField(
      RULE_EXECUTION_FIELDS.startedAt,
      'date',
      COLUMN_TIMESTAMP,
      { sortable: true }
    ),
    [RULE_EXECUTION_FIELDS.ruleId]: displayField(
      RULE_EXECUTION_FIELDS.ruleId,
      'string',
      RULES_COLUMN_RULE
    ),
    [RULE_EXECUTION_FIELDS.duration]: displayField(
      RULE_EXECUTION_FIELDS.duration,
      'number',
      RULES_COLUMN_DURATION,
      { sortable: true }
    ),
    [RULE_EXECUTION_FIELDS.outcome]: displayField(
      RULE_EXECUTION_FIELDS.outcome,
      'string',
      RULES_COLUMN_RESPONSE
    ),
    [RULE_EXECUTION_FIELDS.message]: displayField(
      RULE_EXECUTION_FIELDS.message,
      'string',
      RULES_COLUMN_MESSAGE
    ),
  },
};

export const useRuleExecutionsDataView = () => useAdHocDataView(RULE_EXECUTIONS_DATA_VIEW_SPEC);

// Projects a rule execution into a `DataTableRecord` for `UnifiedDataTable`. Reading the payload
// through the typed `item` is the drift guard: a shape change in `RuleExecutionView` (e.g. moving
// `timings.duration` or renaming `rule.id`) fails to compile here. The Rule name and the message
// success/empty fallbacks are resolved at render time (rule name needs the rules cache, the
// fallbacks are presentation), so only the raw values are carried here.
export const ruleExecutionToDataTableRecord = (item: RuleExecutionView): DataTableRecord => ({
  id: item.id,
  raw: {},
  flattened: {
    [RULE_EXECUTION_FIELDS.startedAt]: item.started_at,
    [RULE_EXECUTION_FIELDS.ruleId]: item.rule.id,
    [RULE_EXECUTION_FIELDS.duration]: item.timings.duration,
    [RULE_EXECUTION_FIELDS.outcome]: item.outcome,
    [RULE_EXECUTION_FIELDS.message]: item.error?.message ?? item.reason ?? null,
  },
});

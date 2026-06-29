/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';

const v1Schema = schema.object({
  has_errors: schema.boolean(),
  error_messages: schema.maybe(schema.recordOf(schema.string(), schema.any())),
  runs: schema.number(),
  count_total: schema.number(),
  count_by_type: schema.recordOf(schema.string(), schema.number()),
  count_gen_ai_provider_types: schema.recordOf(schema.string(), schema.number()),
  count_active_total: schema.number(),
  count_active_by_type: schema.recordOf(schema.string(), schema.number()),
  count_active_alert_history_connectors: schema.number(),
  count_active_email_connectors_by_service_type: schema.recordOf(schema.string(), schema.number()),
  count_actions_namespaces: schema.number(),
  count_actions_executions_per_day: schema.number(),
  count_actions_executions_by_type_per_day: schema.recordOf(schema.string(), schema.number()),
  count_actions_executions_failed_per_day: schema.number(),
  count_actions_executions_failed_by_type_per_day: schema.recordOf(
    schema.string(),
    schema.number()
  ),
  avg_execution_time_per_day: schema.number(),
  avg_execution_time_by_type_per_day: schema.recordOf(schema.string(), schema.number()),
  count_connector_types_by_action_run_outcome_per_day: schema.recordOf(
    schema.string(),
    schema.recordOf(schema.string(), schema.number())
  ),
});

const v2Schema = v1Schema.extends({
  error_messages: schema.maybe(
    schema.oneOf([schema.recordOf(schema.string(), schema.any()), schema.arrayOf(schema.string())])
  ),
});

/**
 * WARNING: Do not modify the existing versioned schema(s) below, instead define a new version (ex: 2, 3, 4).
 * This is required to support zero-downtime upgrades and rollbacks. See https://github.com/elastic/kibana/issues/155764.
 *
 * As you add a new schema version, don't forget to change latestTaskStateSchema variable to reference the latest schema.
 * For example, changing stateSchemaByVersion[1].schema to stateSchemaByVersion[2].schema.
 */
export const stateSchemaByVersion = {
  1: {
    // A task that was created < 8.10 will go through this "up" migration
    // to ensure it matches the v1 schema.
    up: (state: Record<string, unknown>) => ({
      has_errors: state.has_errors || false,
      error_messages: state.error_messages || undefined,
      runs: state.runs || 0,
      count_total: state.count_total || 0,
      count_by_type: state.count_by_type || {},
      count_gen_ai_provider_types: state.count_gen_ai_provider_types || {},
      count_active_total: state.count_active_total || 0,
      count_active_by_type: state.count_active_by_type || {},
      count_active_alert_history_connectors: state.count_active_alert_history_connectors || 0,
      count_active_email_connectors_by_service_type:
        state.count_active_email_connectors_by_service_type || {},
      count_actions_namespaces: state.count_actions_namespaces || 0,
      count_actions_executions_per_day: state.count_actions_executions_per_day || 0,
      count_actions_executions_by_type_per_day:
        state.count_actions_executions_by_type_per_day || {},
      count_actions_executions_failed_per_day: state.count_actions_executions_failed_per_day || 0,
      count_actions_executions_failed_by_type_per_day:
        state.count_actions_executions_failed_by_type_per_day || {},
      avg_execution_time_per_day: state.avg_execution_time_per_day || 0,
      avg_execution_time_by_type_per_day: state.avg_execution_time_by_type_per_day || {},
      count_connector_types_by_action_run_outcome_per_day:
        state.count_connector_types_by_action_run_outcome_per_day || {},
    }),
    schema: v1Schema,
  },
  2: {
    up: (state: Record<string, unknown>) => {
      return state;
    },
    schema: v2Schema,
  },
};

const latestTaskStateSchema = stateSchemaByVersion[2].schema;
export type LatestTaskStateSchema = TypeOf<typeof latestTaskStateSchema>;

export const emptyState: LatestTaskStateSchema = {
  has_errors: false,
  error_messages: undefined,
  runs: 0,
  count_total: 0,
  count_by_type: {},
  count_gen_ai_provider_types: {},
  count_active_total: 0,
  count_active_by_type: {},
  count_active_alert_history_connectors: 0,
  count_active_email_connectors_by_service_type: {},
  count_actions_namespaces: 0,
  count_actions_executions_per_day: 0,
  count_actions_executions_by_type_per_day: {},
  count_actions_executions_failed_per_day: 0,
  count_actions_executions_failed_by_type_per_day: {},
  avg_execution_time_per_day: 0,
  avg_execution_time_by_type_per_day: {},
  count_connector_types_by_action_run_outcome_per_day: {},
};

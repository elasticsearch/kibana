/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import { stateSchemaByVersion } from './task_state';

describe('telemetry task state', () => {
  describe('v1', () => {
    const v1 = stateSchemaByVersion[1];
    it('should work on empty object when running the up migration', () => {
      const result = v1.up({});
      expect(result).toMatchInlineSnapshot(`
        Object {
          "avg_execution_time_by_type_per_day": Object {},
          "avg_execution_time_per_day": 0,
          "count_actions_executions_by_type_per_day": Object {},
          "count_actions_executions_failed_by_type_per_day": Object {},
          "count_actions_executions_failed_per_day": 0,
          "count_actions_executions_per_day": 0,
          "count_actions_namespaces": 0,
          "count_active_alert_history_connectors": 0,
          "count_active_by_type": Object {},
          "count_active_email_connectors_by_service_type": Object {},
          "count_active_total": 0,
          "count_by_type": Object {},
          "count_connector_types_by_action_run_outcome_per_day": Object {},
          "count_gen_ai_provider_types": Object {},
          "count_total": 0,
          "error_messages": undefined,
          "has_errors": false,
          "runs": 0,
        }
      `);
    });

    it('should produce a state that validates against the v1 schema', () => {
      expect(() => v1.schema.validate(v1.up({}))).not.toThrow();
    });

    it(`shouldn't overwrite properties when running the up migration`, () => {
      const state = {
        avg_execution_time_by_type_per_day: { '.server-log': 1 },
        avg_execution_time_per_day: 2,
        count_actions_executions_by_type_per_day: { '.server-log': 3 },
        count_actions_executions_failed_by_type_per_day: { '.server-log': 4 },
        count_actions_executions_failed_per_day: 5,
        count_actions_executions_per_day: 6,
        count_actions_namespaces: 7,
        count_active_alert_history_connectors: 8,
        count_active_by_type: { '.server-log': 9 },
        count_active_email_connectors_by_service_type: { '.server-log': 10 },
        count_active_total: 11,
        count_by_type: { '.server-log': 12 },
        count_connector_types_by_action_run_outcome_per_day: { '.server-log': 13 },
        count_gen_ai_provider_types: { '.gen-ai': 16 },
        count_total: 14,
        error_messages: ['foo'],
        has_errors: true,
        runs: 15,
      };
      const result = v1.up(cloneDeep(state));
      expect(result).toEqual(state);
    });

    it('should drop unknown properties when running the up migration', () => {
      const state = { foo: true };
      const result = v1.up(state);
      expect(result).not.toHaveProperty('foo');
    });
  });

  describe('v2', () => {
    const v1 = stateSchemaByVersion[1];
    const v2 = stateSchemaByVersion[2];

    it('should work on v1 object when running the up migration', () => {
      const v1Object = v1.up({});
      const result = v2.up(v1Object);
      expect(result).toMatchInlineSnapshot(`
        Object {
          "avg_execution_time_by_type_per_day": Object {},
          "avg_execution_time_per_day": 0,
          "count_actions_executions_by_type_per_day": Object {},
          "count_actions_executions_failed_by_type_per_day": Object {},
          "count_actions_executions_failed_per_day": 0,
          "count_actions_executions_per_day": 0,
          "count_actions_namespaces": 0,
          "count_active_alert_history_connectors": 0,
          "count_active_by_type": Object {},
          "count_active_email_connectors_by_service_type": Object {},
          "count_active_total": 0,
          "count_by_type": Object {},
          "count_connector_types_by_action_run_outcome_per_day": Object {},
          "count_gen_ai_provider_types": Object {},
          "count_total": 0,
          "error_messages": undefined,
          "has_errors": false,
          "runs": 0,
        }
      `);
    });

    it('should produce a state that validates against the v2 schema starting from v1', () => {
      const v1Object = v1.up({});
      expect(() => v2.schema.validate(v2.up(v1Object))).not.toThrow();
    });

    it('shouldnt overwrite properties when running the up migration', () => {
      const state = {
        avg_execution_time_by_type_per_day: { '.server-log': 1 },
        avg_execution_time_per_day: 2,
        count_actions_executions_by_type_per_day: { '.server-log': 3 },
        count_actions_executions_failed_by_type_per_day: { '.server-log': 4 },
        count_actions_executions_failed_per_day: 5,
        count_actions_executions_per_day: 6,
        count_actions_namespaces: 7,
        count_active_alert_history_connectors: 8,
        count_active_by_type: { '.server-log': 9 },
        count_active_email_connectors_by_service_type: { '.server-log': 10 },
        count_active_total: 11,
        count_by_type: { '.server-log': 12 },
        count_connector_types_by_action_run_outcome_per_day: { '.server-log': 13 },
        count_gen_ai_provider_types: { '.gen-ai': 16 },
        count_total: 14,
        error_messages: ['foo'],
        has_errors: true,
        runs: 15,
      };
      const result = v2.up(cloneDeep(state));
      expect(result).toEqual(state);
    });

    it('should validate the new error_message field correctly', () => {
      const state = {
        avg_execution_time_by_type_per_day: { '.server-log': 1 },
        avg_execution_time_per_day: 2,
        count_actions_executions_by_type_per_day: { '.server-log': 3 },
        count_actions_executions_failed_by_type_per_day: { '.server-log': 4 },
        count_actions_executions_failed_per_day: 5,
        count_actions_executions_per_day: 6,
        count_actions_namespaces: 7,
        count_active_alert_history_connectors: 8,
        count_active_by_type: { '.server-log': 9 },
        count_active_email_connectors_by_service_type: { '.server-log': 10 },
        count_active_total: 11,
        count_by_type: { '.server-log': 12 },
        count_connector_types_by_action_run_outcome_per_day: { '.server-log': { key: 11 } },
        count_total: 14,
        error_messages: ['foo', 'bar'],
        has_errors: true,
        runs: 15,
        count_gen_ai_provider_types: { '.server-log': 14 },
      };
      v2.schema.validate(state);
    });
  });
});

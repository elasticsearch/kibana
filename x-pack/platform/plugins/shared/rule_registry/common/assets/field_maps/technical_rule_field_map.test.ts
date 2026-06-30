/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { technicalRuleFieldMap } from './technical_rule_field_map';

// This test purely exists to see what the resultant mappings are and
// make it obvious when some dependency results in the mappings changing
it('matches snapshot', () => {
  expect(technicalRuleFieldMap).toMatchInlineSnapshot(`
    Object {
      "@timestamp": Object {
        "array": false,
        "required": true,
        "type": "date",
      },
      "data_stream.dataset": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "data_stream.namespace": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "data_stream.type": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "ecs.version": Object {
        "array": false,
        "ignore_above": 1024,
        "required": false,
        "type": "keyword",
      },
      "event.action": Object {
        "array": false,
        "ignore_above": 1024,
        "required": false,
        "type": "keyword",
      },
      "event.kind": Object {
        "array": false,
        "ignore_above": 1024,
        "required": false,
        "type": "keyword",
      },
      "event.original": Object {
        "array": false,
        "ignore_above": 32766,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.action_group": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.case_ids": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.consecutive_matches": Object {
        "array": false,
        "required": false,
        "type": "long",
      },
      "kibana.alert.duration.us": Object {
        "array": false,
        "required": false,
        "type": "long",
      },
      "kibana.alert.end": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.flapping": Object {
        "array": false,
        "required": false,
        "type": "boolean",
      },
      "kibana.alert.flapping_history": Object {
        "array": true,
        "required": false,
        "type": "boolean",
      },
      "kibana.alert.index_pattern": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.instance.id": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.intended_timestamp": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.last_detected": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.maintenance_window_ids": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.maintenance_window_names": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.muted": Object {
        "array": false,
        "required": false,
        "type": "boolean",
      },
      "kibana.alert.pending_recovered_count": Object {
        "array": false,
        "required": false,
        "type": "long",
      },
      "kibana.alert.previous_action_group": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.reason": Object {
        "array": false,
        "multi_fields": Array [
          Object {
            "flat_name": "kibana.alert.reason.text",
            "name": "text",
            "type": "match_only_text",
          },
        ],
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.risk_score": Object {
        "array": false,
        "required": false,
        "type": "float",
      },
      "kibana.alert.rule.author": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.category": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.rule.consumer": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.rule.created_at": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.rule.created_by": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.description": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.enabled": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.execution.timestamp": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.rule.execution.type": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.execution.uuid": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.from": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.interval": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.license": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.name": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.rule.note": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.parameters": Object {
        "array": false,
        "ignore_above": 4096,
        "required": false,
        "type": "flattened",
      },
      "kibana.alert.rule.producer": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.rule.references": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.revision": Object {
        "array": false,
        "required": true,
        "type": "long",
      },
      "kibana.alert.rule.rule_id": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.rule_name_override": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.rule_type_id": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.rule.tags": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.to": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.type": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.updated_at": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.rule.updated_by": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.rule.uuid": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.rule.version": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.scheduled_action.date": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.scheduled_action.group": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.scheduled_action.throttling": Object {
        "required": false,
        "type": "unmapped",
      },
      "kibana.alert.severity": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.severity_improving": Object {
        "array": false,
        "required": false,
        "type": "boolean",
      },
      "kibana.alert.snoozed": Object {
        "array": false,
        "required": false,
        "type": "boolean",
      },
      "kibana.alert.start": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.state": Object {
        "array": false,
        "required": false,
        "type": "unmapped",
      },
      "kibana.alert.status": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.suppression.docs_count": Object {
        "array": false,
        "required": false,
        "type": "long",
      },
      "kibana.alert.suppression.end": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.suppression.start": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.suppression.terms.field": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.suppression.terms.value": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.system_status": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.time_range": Object {
        "array": false,
        "format": "epoch_millis||strict_date_optional_time",
        "required": false,
        "type": "date_range",
      },
      "kibana.alert.updated_at": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.updated_by.user.id": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.updated_by.user.name": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.url": Object {
        "array": false,
        "ignore_above": 2048,
        "index": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.uuid": Object {
        "array": false,
        "required": true,
        "type": "keyword",
      },
      "kibana.alert.workflow_assignee_ids": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.workflow_reason": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.workflow_status": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.workflow_status_updated_at": Object {
        "array": false,
        "required": false,
        "type": "date",
      },
      "kibana.alert.workflow_tags": Object {
        "array": true,
        "required": false,
        "type": "keyword",
      },
      "kibana.alert.workflow_user": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.cps_scope.expression": Object {
        "array": false,
        "required": false,
        "type": "keyword",
      },
      "kibana.cps_scope.linked_projects": Object {
        "array": true,
        "required": false,
        "type": "flattened",
      },
      "kibana.space_ids": Object {
        "array": true,
        "required": true,
        "type": "keyword",
      },
      "kibana.version": Object {
        "array": false,
        "required": false,
        "type": "version",
      },
      "tags": Object {
        "array": true,
        "ignore_above": 1024,
        "required": false,
        "type": "keyword",
      },
    }
  `);
});

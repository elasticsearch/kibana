/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { Alert as LegacyAlert } from '../../../alert/alert';
import { buildNewAlert } from './build_new_alert';
import type { Alert } from '@kbn/alerts-as-data-utils';
import {
  SPACE_IDS,
  ALERT_ACTION_GROUP,
  ALERT_DURATION,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_MUTED,
  ALERT_START,
  ALERT_STATUS,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_ACTION,
  EVENT_KIND,
  TAGS,
  TIMESTAMP,
  VERSION,
  ALERT_TIME_RANGE,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_SEVERITY_IMPROVING,
  ALERT_SNOOZED,
  ALERT_PENDING_RECOVERED_COUNT,
} from '@kbn/rule-data-utils';
import { alertRule } from '../test_fixtures';
import type { AlertRuleData } from '../../types';

describe('buildNewAlert', () => {
  test('should build alert document with info from legacy alert', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should include start and duration if set', () => {
    const now = Date.now();
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default').replaceState({ start: now, duration: '0' });

    expect(
      buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [ALERT_DURATION]: 0,
      [ALERT_START]: now,
      [ALERT_TIME_RANGE]: { gte: now },
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test(`should set kibana.space_ids to '*' if dangerouslyCreateAlertsInAllSpaces=true`, () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
        dangerouslyCreateAlertsInAllSpaces: true,
      })
    ).toEqual({
      ...alertRule,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['*'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should include flapping history and maintenance window ids and names if set', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');
    legacyAlert.setFlappingHistory([true, false, false, false, true, true]);
    legacyAlert.setMaintenanceWindowIds(['maint-1', 'maint-321']);
    legacyAlert.setMaintenanceWindowNames(['Maintenance Window 1', 'Maintenance Window 321']);

    expect(
      buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [true, false, false, false, true, true],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: ['maint-1', 'maint-321'],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: ['Maintenance Window 1', 'Maintenance Window 321'],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should include alert payload if specified', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<
        { count: number; url: string; 'kibana.alert.nested_field': number },
        {},
        {},
        'default',
        'recovered'
      >({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        payload: { count: 1, url: `https://url1`, 'kibana.alert.nested_field': 2 },
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      count: 1,
      url: `https://url1`,
      'kibana.alert.nested_field': 2,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should use runTimestamp if provided', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        runTimestamp: '2030-12-15T02:44:13.124Z',
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2030-12-15T02:44:13.124Z',
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should use workflow status from alert payload if set', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<
        Alert & { count: number; url: string; 'kibana.alert.nested_field': number },
        {},
        {},
        'default',
        'recovered'
      >({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        payload: {
          count: 1,
          url: `https://url1`,
          'kibana.alert.nested_field': 2,
          [ALERT_WORKFLOW_STATUS]: 'custom_workflow',
        },
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      count: 1,
      url: `https://url1`,
      'kibana.alert.nested_field': 2,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'custom_workflow',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should overwrite any framework fields included in payload', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<
        {
          count: number;
          url: string;
          [ALERT_ACTION_GROUP]: string;
          'kibana.alert.nested_field': number;
        },
        {},
        {},
        'default',
        'recovered'
      >({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        payload: {
          count: 1,
          url: `https://url1`,
          [ALERT_ACTION_GROUP]: 'bad action group',
          'kibana.alert.nested_field': 2,
        },
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      count: 1,
      url: `https://url1`,
      'kibana.alert.nested_field': 2,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should merge and de-dupe rule tags and any tags from payload', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    expect(
      buildNewAlert<
        {
          count: number;
          url: string;
          [ALERT_ACTION_GROUP]: string;
          'kibana.alert.nested_field': number;
          tags: string[];
        },
        {},
        {},
        'default',
        'recovered'
      >({
        legacyAlert,
        rule: alertRule,
        timestamp: '2023-03-28T12:27:28.159Z',
        payload: {
          count: 1,
          url: `https://url1`,
          [ALERT_ACTION_GROUP]: 'bad action group',
          'kibana.alert.nested_field': 2,
          tags: ['custom-tag1', '-tags'],
        },
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      count: 1,
      url: `https://url1`,
      'kibana.alert.nested_field': 2,
      [TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: '2023-03-28T12:27:28.159Z',
      [EVENT_ACTION]: 'open',
      [EVENT_KIND]: 'signal',
      [ALERT_ACTION_GROUP]: 'default',
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_FLAPPING]: false,
      [ALERT_MUTED]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: 'alert-A',
      [ALERT_SEVERITY_IMPROVING]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_STATUS]: 'active',
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['custom-tag1', '-tags', 'rule-'],
    });
  });

  describe('ALERT_MUTED field', () => {
    const ruleData: AlertRuleData = {
      consumer: 'bar',
      executionId: '5f6aa57d-3e22-484e-bae8-cbed868f4d28',
      id: '1',
      name: 'rule-name',
      parameters: { bar: true },
      revision: 0,
      spaceId: 'default',
      tags: ['rule-', '-tags'],
      alertDelay: 0,
      muteAll: false,
      mutedInstanceIds: [],
    };

    test('should set ALERT_MUTED to false when alert is not muted', () => {
      const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
      legacyAlert.scheduleActions('default');

      const result = buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        ruleData,
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      });

      expect((result as Record<string, unknown>)[ALERT_MUTED]).toBe(false);
    });

    test('should set ALERT_MUTED to true when muteAll is true', () => {
      const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
      legacyAlert.scheduleActions('default');

      const result = buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        ruleData: {
          ...ruleData,
          muteAll: true,
        },
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      });

      expect((result as Record<string, unknown>)[ALERT_MUTED]).toBe(true);
    });

    test('should set ALERT_MUTED to true when alert instance ID is in mutedInstanceIds', () => {
      const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
      legacyAlert.scheduleActions('default');

      const result = buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        ruleData: {
          ...ruleData,
          mutedInstanceIds: ['alert-A', 'alert-B'],
        },
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      });

      expect((result as Record<string, unknown>)[ALERT_MUTED]).toBe(true);
    });

    test('should set ALERT_MUTED to false when alert instance ID is not in mutedInstanceIds', () => {
      const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
      legacyAlert.scheduleActions('default');

      const result = buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        ruleData: {
          ...ruleData,
          mutedInstanceIds: ['alert-B', 'alert-C'],
        },
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      });

      expect((result as Record<string, unknown>)[ALERT_MUTED]).toBe(false);
    });

    test('should set ALERT_MUTED to true when muteAll is true even if instance not in mutedInstanceIds', () => {
      const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
      legacyAlert.scheduleActions('default');

      const result = buildNewAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        ruleData: {
          ...ruleData,
          muteAll: true,
          mutedInstanceIds: ['alert-B'],
        },
        timestamp: '2023-03-28T12:27:28.159Z',
        kibanaVersion: '8.9.0',
      });

      expect((result as Record<string, unknown>)[ALERT_MUTED]).toBe(true);
    });
  });
});

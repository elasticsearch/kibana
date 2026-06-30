/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { Alert as LegacyAlert } from '../../../alert/alert';
import {
  ALERT_ACTION_GROUP,
  ALERT_CONSECUTIVE_MATCHES,
  ALERT_DURATION,
  ALERT_FLAPPING,
  ALERT_FLAPPING_HISTORY,
  ALERT_INSTANCE_ID,
  ALERT_MAINTENANCE_WINDOW_IDS,
  ALERT_MAINTENANCE_WINDOW_NAMES,
  ALERT_MUTED,
  ALERT_PENDING_RECOVERED_COUNT,
  ALERT_RULE_EXECUTION_TIMESTAMP,
  ALERT_RULE_EXECUTION_UUID,
  ALERT_RULE_UUID,
  ALERT_START,
  ALERT_STATUS,
  ALERT_STATUS_DELAYED,
  ALERT_SNOOZED,
  ALERT_TIME_RANGE,
  ALERT_UUID,
  ALERT_WORKFLOW_STATUS,
  EVENT_KIND,
  SPACE_IDS,
  TAGS,
  TIMESTAMP,
  VERSION,
} from '@kbn/rule-data-utils';
import { alertRule } from '../test_fixtures';
import { buildDelayedAlert } from './build_delayed_alert';
import { get } from 'lodash';

describe('buildDelayedAlert', () => {
  test('should build alert document with framework fields from legacy alert', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    const timestamp = '2023-03-28T12:27:28.159Z';
    const alertInstanceId = legacyAlert.getId();

    expect(
      buildDelayedAlert<{}, {}, {}, 'default', 'recovered'>({
        legacyAlert,
        rule: alertRule,
        timestamp,
        kibanaVersion: '8.9.0',
      })
    ).toEqual({
      ...alertRule,
      [TIMESTAMP]: timestamp,
      [EVENT_KIND]: 'signal',
      [ALERT_RULE_EXECUTION_TIMESTAMP]: timestamp,
      [ALERT_RULE_UUID]: get(alertRule, ALERT_RULE_UUID),
      [ALERT_RULE_EXECUTION_UUID]: get(alertRule, ALERT_RULE_EXECUTION_UUID),
      [ALERT_ACTION_GROUP]: legacyAlert.getScheduledActionOptions()?.actionGroup,
      [ALERT_FLAPPING]: false,
      [ALERT_FLAPPING_HISTORY]: [],
      [ALERT_INSTANCE_ID]: alertInstanceId,
      [ALERT_MAINTENANCE_WINDOW_IDS]: [],
      [ALERT_MAINTENANCE_WINDOW_NAMES]: [],
      [ALERT_CONSECUTIVE_MATCHES]: 0,
      [ALERT_PENDING_RECOVERED_COUNT]: 0,
      [ALERT_MUTED]: false,
      [ALERT_SNOOZED]: false,
      [ALERT_STATUS]: ALERT_STATUS_DELAYED,
      [ALERT_UUID]: legacyAlert.getUuid(),
      [ALERT_WORKFLOW_STATUS]: 'open',
      [SPACE_IDS]: ['default'],
      [VERSION]: '8.9.0',
      [TAGS]: ['rule-', '-tags'],
    });
  });

  test('should include start, duration and time range when set', () => {
    const now = Date.now();
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default').replaceState({ start: now, duration: '0' });

    const built = buildDelayedAlert<{}, {}, {}, 'default', 'recovered'>({
      legacyAlert,
      rule: alertRule,
      timestamp: '2023-03-28T12:27:28.159Z',
      kibanaVersion: '8.9.0',
    });

    expect(built).toMatchObject({
      [ALERT_DURATION]: 0,
      [ALERT_START]: now,
      [ALERT_TIME_RANGE]: { gte: now },
      [ALERT_STATUS]: ALERT_STATUS_DELAYED,
    });
  });

  test('should include rule type payload fields so the doc is a complete predecessor', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    const built = buildDelayedAlert<
      { count: number; url: string; 'kibana.alert.nested_field': number },
      {},
      {},
      'default',
      'recovered'
    >({
      legacyAlert,
      rule: alertRule,
      payload: { count: 1, url: `https://url1`, 'kibana.alert.nested_field': 2 },
      timestamp: '2023-03-28T12:27:28.159Z',
      kibanaVersion: '8.9.0',
    });

    expect(built).toMatchObject({
      count: 1,
      url: `https://url1`,
      'kibana.alert.nested_field': 2,
      [ALERT_STATUS]: ALERT_STATUS_DELAYED,
    });
  });

  test('should set ALERT_WORKFLOW_STATUS from payload if specified', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    const built = buildDelayedAlert<{}, {}, {}, 'default', 'recovered'>({
      legacyAlert,
      rule: alertRule,
      payload: { [ALERT_WORKFLOW_STATUS]: 'custom_workflow' },
      timestamp: '2023-03-28T12:27:28.159Z',
      kibanaVersion: '8.9.0',
    });

    expect(built[ALERT_WORKFLOW_STATUS]).toBe('custom_workflow');
  });

  test(`should set kibana.space_ids to '*' if dangerouslyCreateAlertsInAllSpaces=true`, () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    const built = buildDelayedAlert<{}, {}, {}, 'default', 'recovered'>({
      legacyAlert,
      rule: alertRule,
      timestamp: '2023-03-28T12:27:28.159Z',
      kibanaVersion: '8.9.0',
      dangerouslyCreateAlertsInAllSpaces: true,
    });

    expect(built[SPACE_IDS]).toEqual(['*']);
  });

  test('should merge tags from payload, rule, and de-duplicate', () => {
    const legacyAlert = new LegacyAlert<{}, {}, 'default'>('alert-A');
    legacyAlert.scheduleActions('default');

    const built = buildDelayedAlert<{}, {}, {}, 'default', 'recovered'>({
      legacyAlert,
      rule: alertRule,
      payload: { tags: ['payload-tag', 'rule-'] },
      timestamp: '2023-03-28T12:27:28.159Z',
      kibanaVersion: '8.9.0',
    });

    expect(built[TAGS]).toEqual(expect.arrayContaining(['payload-tag', 'rule-', '-tags']));
    expect(built[TAGS]?.length).toBe(3);
  });
});

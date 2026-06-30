/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getAlertSnoozedStatus } from './get_alert_snoozed_status';
import type { AlertRuleData } from '../types';

const createMockRuleData = (overrides: Partial<AlertRuleData> = {}): AlertRuleData => ({
  consumer: 'test-consumer',
  executionId: 'exec-1',
  id: 'rule-1',
  name: 'Test Rule',
  parameters: {},
  revision: 1,
  spaceId: 'default',
  tags: [],
  alertDelay: 0,
  muteAll: false,
  mutedInstanceIds: [],
  ...overrides,
});

describe('getAlertSnoozedStatus', () => {
  test('should return false when ruleData is undefined', () => {
    expect(getAlertSnoozedStatus('alert-1')).toBe(false);
  });

  test('should return false when snoozedInstances is undefined', () => {
    const ruleData = createMockRuleData();
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(false);
  });

  test('should return false when snoozedInstances is empty', () => {
    const ruleData = createMockRuleData({ snoozedInstances: [] });
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(false);
  });

  test('should return false when alertInstanceId is not in snoozedInstances', () => {
    const ruleData = createMockRuleData({
      snoozedInstances: [
        { instanceId: 'alert-2', snoozedAt: '2026-01-01T00:00:00.000Z', snoozedBy: 'user1' },
        { instanceId: 'alert-3', snoozedAt: '2026-01-01T00:00:00.000Z', snoozedBy: 'user1' },
      ],
    });
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(false);
  });

  test('should return true when alertInstanceId is in snoozedInstances', () => {
    const ruleData = createMockRuleData({
      snoozedInstances: [
        { instanceId: 'alert-1', snoozedAt: '2026-01-01T00:00:00.000Z', snoozedBy: 'user1' },
      ],
    });
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(true);
  });

  test('should return true when alertInstanceId matches one of multiple snoozedInstances', () => {
    const ruleData = createMockRuleData({
      snoozedInstances: [
        { instanceId: 'alert-1', snoozedAt: '2026-01-01T00:00:00.000Z', snoozedBy: 'user1' },
        { instanceId: 'alert-2', snoozedAt: '2026-01-01T00:00:00.000Z', snoozedBy: 'user1' },
      ],
    });
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(true);
  });

  test('should return true for a time-based snooze with expiresAt', () => {
    const ruleData = createMockRuleData({
      snoozedInstances: [
        {
          instanceId: 'alert-1',
          snoozedAt: '2026-01-01T00:00:00.000Z',
          snoozedBy: 'user1',
          expiresAt: '2026-12-31T00:00:00.000Z',
        },
      ],
    });
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(true);
  });

  test('should return true for a condition-based snooze', () => {
    const ruleData = createMockRuleData({
      snoozedInstances: [
        {
          instanceId: 'alert-1',
          snoozedAt: '2026-01-01T00:00:00.000Z',
          snoozedBy: 'user1',
          conditions: [{ type: 'severity_change' }],
        },
      ],
    });
    expect(getAlertSnoozedStatus('alert-1', ruleData)).toBe(true);
  });
});

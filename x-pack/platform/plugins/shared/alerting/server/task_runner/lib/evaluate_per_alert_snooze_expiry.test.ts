/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { evaluatePerAlertSnoozeExpiry } from './evaluate_per_alert_snooze_expiry';
import type { RawRuleSnoozedInstance } from '../../saved_objects/schemas/raw_rule';

const NOW = new Date('1970-01-01T00:00:00.000Z');

describe('evaluatePerAlertSnoozeExpiry', () => {
  it('returns empty arrays when snoozedInstances is empty', () => {
    const result = evaluatePerAlertSnoozeExpiry([], NOW);
    expect(result.activeInstances).toHaveLength(0);
    expect(result.expiredInstances).toHaveLength(0);
  });

  it('treats an instance with no expiresAt as indefinitely snoozed (active)', () => {
    const instance: RawRuleSnoozedInstance = {
      instanceId: 'alert-1',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
    };
    const result = evaluatePerAlertSnoozeExpiry([instance], NOW);
    expect(result.activeInstances).toHaveLength(1);
    expect(result.activeInstances[0].instanceId).toBe('alert-1');
    expect(result.expiredInstances).toHaveLength(0);
  });

  it('treats an instance whose expiresAt is in the future as active', () => {
    const instance: RawRuleSnoozedInstance = {
      instanceId: 'alert-2',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      expiresAt: '1970-01-02T00:00:00.000Z',
    };
    const result = evaluatePerAlertSnoozeExpiry([instance], NOW);
    expect(result.activeInstances).toHaveLength(1);
    expect(result.activeInstances[0].instanceId).toBe('alert-2');
    expect(result.expiredInstances).toHaveLength(0);
  });

  it('treats an instance whose expiresAt equals now as expired', () => {
    const instance: RawRuleSnoozedInstance = {
      instanceId: 'alert-3',
      snoozedAt: '1969-12-01T00:00:00.000Z',
      snoozedBy: 'user',
      expiresAt: '1970-01-01T00:00:00.000Z',
    };
    const result = evaluatePerAlertSnoozeExpiry([instance], NOW);
    expect(result.activeInstances).toHaveLength(0);
    expect(result.expiredInstances).toHaveLength(1);
    expect(result.expiredInstances[0].instanceId).toBe('alert-3');
  });

  it('treats an instance whose expiresAt is in the past as expired', () => {
    const instance: RawRuleSnoozedInstance = {
      instanceId: 'alert-4',
      snoozedAt: '1969-10-01T00:00:00.000Z',
      snoozedBy: 'user',
      expiresAt: '1969-12-31T23:59:59.000Z',
    };
    const result = evaluatePerAlertSnoozeExpiry([instance], NOW);
    expect(result.activeInstances).toHaveLength(0);
    expect(result.expiredInstances).toHaveLength(1);
  });

  it('correctly separates a mix of active and expired instances', () => {
    const instances: RawRuleSnoozedInstance[] = [
      { instanceId: 'active-indefinite', snoozedAt: '1969-12-01T00:00:00.000Z', snoozedBy: 'user' },
      {
        instanceId: 'active-future',
        snoozedAt: '1969-12-01T00:00:00.000Z',
        snoozedBy: 'user',
        expiresAt: '1970-06-01T00:00:00.000Z',
      },
      {
        instanceId: 'expired-past',
        snoozedAt: '1969-10-01T00:00:00.000Z',
        snoozedBy: 'user',
        expiresAt: '1969-12-31T23:59:59.000Z',
      },
    ];
    const result = evaluatePerAlertSnoozeExpiry(instances, NOW);
    expect(result.activeInstances.map((i) => i.instanceId)).toContain('active-indefinite');
    expect(result.activeInstances.map((i) => i.instanceId)).toContain('active-future');
    expect(result.activeInstances).toHaveLength(2);
    expect(result.expiredInstances).toHaveLength(1);
    expect(result.expiredInstances[0].instanceId).toBe('expired-past');
  });
});

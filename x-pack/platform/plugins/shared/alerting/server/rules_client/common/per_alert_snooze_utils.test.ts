/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_SEVERITY } from '@kbn/rule-data-utils';
import {
  buildPerAlertSnoozeEntry,
  getPerAlertSnoozeSnapshotFields,
  removePerAlertSnoozeEntry,
  upsertPerAlertSnoozeEntry,
} from './per_alert_snooze_utils';
import type { SnoozeAlertInstanceBody } from '../../application/rule/methods/snooze_alert_instance/types';

const BASE_BODY: SnoozeAlertInstanceBody = {
  expiresAt: '2099-12-31T23:59:59.000Z',
};

describe('per_alert_snooze_utils', () => {
  describe('getPerAlertSnoozeSnapshotFields', () => {
    it('returns an empty array when there are no conditions', () => {
      expect(getPerAlertSnoozeSnapshotFields(BASE_BODY)).toEqual([]);
    });

    it('returns an empty array when conditions is an empty array', () => {
      expect(getPerAlertSnoozeSnapshotFields({ ...BASE_BODY, conditions: [] })).toEqual([]);
    });

    it('returns the field name for a field_change condition', () => {
      const body: SnoozeAlertInstanceBody = {
        ...BASE_BODY,
        conditions: [{ type: 'field_change', field: 'host.name' }],
      };
      expect(getPerAlertSnoozeSnapshotFields(body)).toEqual(['host.name']);
    });

    it('returns ALERT_SEVERITY for a severity_change condition', () => {
      const body: SnoozeAlertInstanceBody = {
        ...BASE_BODY,
        conditions: [{ type: 'severity_change' }],
      };
      expect(getPerAlertSnoozeSnapshotFields(body)).toEqual([ALERT_SEVERITY]);
    });

    it('collects fields from multiple conditions of different types', () => {
      const body: SnoozeAlertInstanceBody = {
        ...BASE_BODY,
        conditions: [
          { type: 'field_change', field: 'host.name' },
          { type: 'severity_change' },
          { type: 'field_change', field: 'tags' },
        ],
      };
      const result = getPerAlertSnoozeSnapshotFields(body);
      expect(result).toEqual(expect.arrayContaining(['host.name', ALERT_SEVERITY, 'tags']));
      expect(result).toHaveLength(3);
    });

    it('deduplicates repeated fields', () => {
      const body: SnoozeAlertInstanceBody = {
        ...BASE_BODY,
        conditions: [
          { type: 'field_change', field: 'host.name' },
          { type: 'field_change', field: 'host.name' },
        ],
      };
      expect(getPerAlertSnoozeSnapshotFields(body)).toEqual(['host.name']);
    });
  });

  describe('buildPerAlertSnoozeEntry', () => {
    const BASE_ARGS = {
      alertInstanceId: 'alert-1',
      body: BASE_BODY,
      snoozedAt: '2026-04-27T00:00:00.000Z',
      snoozedBy: 'user1',
    };

    it('builds a snooze entry from the given arguments', () => {
      expect(buildPerAlertSnoozeEntry(BASE_ARGS)).toEqual({
        instanceId: 'alert-1',
        expiresAt: '2099-12-31T23:59:59.000Z',
        conditions: undefined,
        conditionOperator: undefined,
        snoozeSnapshot: undefined,
        snoozedAt: '2026-04-27T00:00:00.000Z',
        snoozedBy: 'user1',
      });
    });

    it('falls back to empty string when snoozedBy is null', () => {
      const entry = buildPerAlertSnoozeEntry({ ...BASE_ARGS, snoozedBy: null });
      expect(entry.snoozedBy).toBe('');
    });

    it('includes snoozeSnapshot when it is non-empty', () => {
      const entry = buildPerAlertSnoozeEntry({
        ...BASE_ARGS,
        snoozeSnapshot: { 'kibana.alert.severity': 'critical' },
      });
      expect(entry.snoozeSnapshot).toEqual({ 'kibana.alert.severity': 'critical' });
    });

    it('omits snoozeSnapshot when it is an empty object', () => {
      const entry = buildPerAlertSnoozeEntry({ ...BASE_ARGS, snoozeSnapshot: {} });
      expect(entry.snoozeSnapshot).toBeUndefined();
    });

    it('omits snoozeSnapshot when it is undefined', () => {
      const entry = buildPerAlertSnoozeEntry({ ...BASE_ARGS, snoozeSnapshot: undefined });
      expect(entry.snoozeSnapshot).toBeUndefined();
    });

    it('includes conditions and conditionOperator when provided', () => {
      const body: SnoozeAlertInstanceBody = {
        expiresAt: '2099-12-31T23:59:59.000Z',
        conditions: [{ type: 'severity_change' }],
        conditionOperator: 'any',
      };
      const entry = buildPerAlertSnoozeEntry({ ...BASE_ARGS, body });
      expect(entry.conditions).toEqual([{ type: 'severity_change' }]);
      expect(entry.conditionOperator).toBe('any');
    });
  });

  describe('upsertPerAlertSnoozeEntry', () => {
    const existingEntry = {
      instanceId: 'alert-1',
      snoozedAt: '2026-01-01T00:00:00.000Z',
      snoozedBy: 'user1',
    };
    const newEntry = {
      instanceId: 'alert-1',
      snoozedAt: '2026-04-27T00:00:00.000Z',
      snoozedBy: 'user2',
    };
    const otherEntry = {
      instanceId: 'alert-2',
      snoozedAt: '2026-01-01T00:00:00.000Z',
      snoozedBy: 'user1',
    };

    it('appends the entry when snoozedInstances is undefined', () => {
      const result = upsertPerAlertSnoozeEntry({
        snoozedInstances: undefined,
        snoozedInstance: newEntry,
      });
      expect(result).toEqual([newEntry]);
    });

    it('appends the entry when snoozedInstances is empty', () => {
      const result = upsertPerAlertSnoozeEntry({ snoozedInstances: [], snoozedInstance: newEntry });
      expect(result).toEqual([newEntry]);
    });

    it('replaces an existing entry with the same instanceId', () => {
      const result = upsertPerAlertSnoozeEntry({
        snoozedInstances: [existingEntry, otherEntry],
        snoozedInstance: newEntry,
      });
      expect(result).toEqual([otherEntry, newEntry]);
    });

    it('appends a new entry when instanceId does not yet exist', () => {
      const brandNewEntry = {
        instanceId: 'alert-3',
        snoozedAt: '2026-04-27T00:00:00.000Z',
        snoozedBy: 'user1',
      };
      const result = upsertPerAlertSnoozeEntry({
        snoozedInstances: [existingEntry, otherEntry],
        snoozedInstance: brandNewEntry,
      });
      expect(result).toEqual([existingEntry, otherEntry, brandNewEntry]);
    });
  });

  describe('removePerAlertSnoozeEntry', () => {
    const entry1 = {
      instanceId: 'alert-1',
      snoozedAt: '2026-01-01T00:00:00.000Z',
      snoozedBy: 'user1',
    };
    const entry2 = {
      instanceId: 'alert-2',
      snoozedAt: '2026-01-01T00:00:00.000Z',
      snoozedBy: 'user1',
    };

    it('returns an empty array when snoozedInstances is undefined', () => {
      expect(
        removePerAlertSnoozeEntry({ snoozedInstances: undefined, alertInstanceId: 'alert-1' })
      ).toEqual([]);
    });

    it('returns an empty array when snoozedInstances is empty', () => {
      expect(
        removePerAlertSnoozeEntry({ snoozedInstances: [], alertInstanceId: 'alert-1' })
      ).toEqual([]);
    });

    it('removes the entry matching the given alertInstanceId', () => {
      const result = removePerAlertSnoozeEntry({
        snoozedInstances: [entry1, entry2],
        alertInstanceId: 'alert-1',
      });
      expect(result).toEqual([entry2]);
    });

    it('returns all entries unchanged when the alertInstanceId is not found', () => {
      const result = removePerAlertSnoozeEntry({
        snoozedInstances: [entry1, entry2],
        alertInstanceId: 'alert-99',
      });
      expect(result).toEqual([entry1, entry2]);
    });
  });
});

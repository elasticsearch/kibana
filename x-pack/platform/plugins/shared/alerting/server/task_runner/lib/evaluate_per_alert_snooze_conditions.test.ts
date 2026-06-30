/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_SEVERITY } from '@kbn/rule-data-utils';
import { evaluatePerAlertSnoozeConditions } from './evaluate_per_alert_snooze_conditions';
import type { RawRuleSnoozedInstance } from '../../saved_objects/schemas/raw_rule';

const makeInstance = (overrides: Partial<RawRuleSnoozedInstance> = {}): RawRuleSnoozedInstance => ({
  instanceId: 'alert-1',
  snoozedAt: '2026-01-01T00:00:00.000Z',
  snoozedBy: 'user',
  ...overrides,
});

const buildMap = (
  entries: Array<[string, Record<string, unknown>]>
): Map<string, Record<string, unknown>> => new Map(entries);

describe('evaluatePerAlertSnoozeConditions', () => {
  describe('no conditions on instance', () => {
    it('keeps instance snoozed when conditions array is absent', () => {
      const instance = makeInstance({ instanceId: 'alert-1' });
      const alertAsData = { [ALERT_SEVERITY]: 'high' };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when conditions array is empty', () => {
      const instance = makeInstance({ instanceId: 'alert-1', conditions: [] });
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', { [ALERT_SEVERITY]: 'high' }]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });

  describe('alert not in field map', () => {
    it('keeps instance snoozed when alert has no alert-as-data (not in map)', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const result = evaluatePerAlertSnoozeConditions([instance], new Map());
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });

  describe('field_change condition', () => {
    it('unsnoozes when the tracked field changed from the snapshot value', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
        snoozeSnapshot: { 'kibana.alert.severity': 'low' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
      expect(result.conditionExpiredInstances[0].instanceId).toBe('alert-1');
    });

    it('keeps instance snoozed when the tracked field is unchanged', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
        snoozeSnapshot: { 'kibana.alert.severity': 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when the snapshot does not contain the tracked field', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
        snoozeSnapshot: {},
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when snoozeSnapshot is undefined', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
        snoozeSnapshot: undefined,
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when field was absent at snooze time (null) and is still absent (undefined)', () => {
      // Rule type does not produce kibana.alert.severity. The snapshot captures
      // null for the missing field; the alert builder returns undefined at
      // evaluation time. null and undefined must be treated as equivalent.
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: null },
      });
      const alertAsData = { 'kibana.alert.rule.tags': ['test', '1'] }; // no severity field
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('unsnoozes when field transitions from absent (null snapshot) to a real value', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'field_change', field: 'kibana.alert.severity' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: null },
      });
      const alertAsData = { 'kibana.alert.severity': 'high' };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });

    it('keeps instance snoozed with any-operator when no condition actually fires (null/undefined absent field)', () => {
      // Regression: severity_change on a non-severity rule must NOT fire just
      // because the snapshot stored null and the alert builder returns undefined.
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'any',
        conditions: [
          { type: 'field_change', field: 'kibana.alert.rule.tags' },
          { type: 'severity_change' },
          { type: 'severity_equals', value: 'critical' },
        ],
        snoozeSnapshot: {
          'kibana.alert.rule.tags': ['test', '1'],
          [ALERT_SEVERITY]: null,
        },
      });
      // Tags unchanged, severity absent both at snooze and now
      const alertAsData = { 'kibana.alert.rule.tags': ['test', '1'] };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    describe('array-typed fields (e.g. kibana.alert.rule.tags)', () => {
      // getAlertSnoozeSnapshot now uses _source (not the fields API) so snapshots
      // capture the exact stored structure. Tags are always arrays in the source,
      // so both snapshot and current alert data carry the array form.

      it('keeps instance snoozed when single-element array tag is unchanged', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.tags' }],
          snoozeSnapshot: { 'kibana.alert.rule.tags': ['1'] },
        });
        const alertAsData = { 'kibana.alert.rule.tags': ['1'] };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(0);
      });

      it('unsnoozes when the tag value actually changed', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.tags' }],
          snoozeSnapshot: { 'kibana.alert.rule.tags': ['tag-a'] },
        });
        const alertAsData = { 'kibana.alert.rule.tags': ['tag-b'] };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(1);
      });

      it('unsnoozes when a tag is added', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.tags' }],
          snoozeSnapshot: { 'kibana.alert.rule.tags': ['tag-a'] },
        });
        const alertAsData = { 'kibana.alert.rule.tags': ['tag-a', 'tag-b'] };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(1);
      });

      it('keeps instance snoozed when multi-element array tags are unchanged', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.tags' }],
          snoozeSnapshot: { 'kibana.alert.rule.tags': ['tag-a', 'tag-b'] },
        });
        const alertAsData = { 'kibana.alert.rule.tags': ['tag-a', 'tag-b'] };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(0);
      });

      it('unsnoozes when multi-element array tags change', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.tags' }],
          snoozeSnapshot: { 'kibana.alert.rule.tags': ['tag-a', 'tag-b'] },
        });
        const alertAsData = { 'kibana.alert.rule.tags': ['tag-a', 'tag-c'] };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(1);
      });
    });

    describe('object fields (e.g. kibana.alert.rule.parameters)', () => {
      // getAlertSnoozeSnapshot uses _source so object field values (including
      // nested arrays like threshold:[1]) are captured exactly as stored.
      // isEqual is used instead of JSON.stringify to handle key-order differences
      // between the snapshot and the in-memory alert builder output.

      it('keeps instance snoozed when object field is unchanged', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.parameters' }],
          // Snapshot from _source preserves threshold as an array [1]
          snoozeSnapshot: { 'kibana.alert.rule.parameters': { threshold: [1], size: 100 } },
        });
        const alertAsData = { 'kibana.alert.rule.parameters': { threshold: [1], size: 100 } };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(0);
      });

      it('keeps instance snoozed when object field is unchanged but key order differs', () => {
        // Snapshot captured keys in one order, alert builder produces them in another.
        // isEqual correctly sees them as equal regardless of key ordering.
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.parameters' }],
          snoozeSnapshot: { 'kibana.alert.rule.parameters': { threshold: [1], size: 100 } },
        });
        const alertAsData = { 'kibana.alert.rule.parameters': { size: 100, threshold: [1] } };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(0);
      });

      it('unsnoozes when object field actually changes', () => {
        const instance = makeInstance({
          instanceId: 'alert-1',
          conditions: [{ type: 'field_change', field: 'kibana.alert.rule.parameters' }],
          snoozeSnapshot: { 'kibana.alert.rule.parameters': { threshold: [1], size: 100 } },
        });
        const alertAsData = { 'kibana.alert.rule.parameters': { threshold: [5], size: 100 } };
        const result = evaluatePerAlertSnoozeConditions(
          [instance],
          buildMap([['alert-1', alertAsData]])
        );
        expect(result.conditionExpiredInstances).toHaveLength(1);
      });
    });
  });

  describe('severity_change condition', () => {
    it('unsnoozes when severity changed from the snapshot value', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'low' },
      });
      const alertAsData = { kibana: { alert: { severity: 'critical' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });

    it('keeps instance snoozed when severity is unchanged', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when snapshot has no severity field', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: {},
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });

  describe('severity_equals condition', () => {
    it('unsnoozes when current severity matches the target value', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_equals', value: 'critical' }],
        snoozeSnapshot: {},
      });
      const alertAsData = { kibana: { alert: { severity: 'critical' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });

    it('keeps instance snoozed when current severity does not match the target', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_equals', value: 'critical' }],
        snoozeSnapshot: {},
      });
      const alertAsData = { kibana: { alert: { severity: 'low' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when current severity is absent', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_equals', value: 'critical' }],
        snoozeSnapshot: {},
      });
      const alertAsData = {};
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });

  describe('conditionOperator: any (default)', () => {
    it('unsnoozes when any condition is met (first condition matches)', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'any',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'kibana.alert.severity' },
        ],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'critical' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });

    it('unsnoozes when any condition is met (second condition matches)', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'any',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'kibana.alert.severity' },
        ],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'low' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });

    it('keeps instance snoozed when no conditions are met', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'any',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'kibana.alert.severity' },
        ],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('unsnoozes with default operator (undefined) when any condition is met', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'kibana.alert.severity' },
        ],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'critical' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });
  });

  describe('conditionOperator: all', () => {
    it('unsnoozes only when all conditions are met', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'all',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'kibana.alert.severity' },
        ],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'low' },
      });
      const alertAsData = { kibana: { alert: { severity: 'critical' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
    });

    it('keeps instance snoozed when only one of two conditions is met', () => {
      // severity_equals 'critical' → true (current IS critical)
      // field_change 'some.other.field' → false (field unchanged in snapshot)
      // With 'all': one false → stay snoozed
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'all',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'some.other.field' },
        ],
        snoozeSnapshot: { 'some.other.field': 'unchanged' },
      });
      const alertAsData = {
        kibana: { alert: { severity: 'critical' } },
        some: { other: { field: 'unchanged' } },
      };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });

    it('keeps instance snoozed when no conditions are met', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditionOperator: 'all',
        conditions: [
          { type: 'severity_equals', value: 'critical' },
          { type: 'field_change', field: 'kibana.alert.severity' },
        ],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });

  describe('multiple instances', () => {
    it('evaluates each instance independently', () => {
      const instanceA = makeInstance({
        instanceId: 'alert-a',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'low' },
      });
      const instanceB = makeInstance({
        instanceId: 'alert-b',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const result = evaluatePerAlertSnoozeConditions(
        [instanceA, instanceB],
        buildMap([
          ['alert-a', { kibana: { alert: { severity: 'critical' } } }],
          ['alert-b', { kibana: { alert: { severity: 'high' } } }],
        ])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
      expect(result.conditionExpiredInstances[0].instanceId).toBe('alert-a');
    });
  });

  describe('alert recovered and re-fired while snoozed', () => {
    it('evaluates conditions on the re-fired alert using its current field values', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'low' },
      });
      // Alert recovered and re-fired with a different severity
      const alertAsData = { kibana: { alert: { severity: 'critical' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(1);
      expect(result.conditionExpiredInstances[0].instanceId).toBe('alert-1');
    });

    it('keeps instance snoozed when re-fired alert severity is the same as snapshot', () => {
      const instance = makeInstance({
        instanceId: 'alert-1',
        conditions: [{ type: 'severity_change' }],
        snoozeSnapshot: { [ALERT_SEVERITY]: 'high' },
      });
      const alertAsData = { kibana: { alert: { severity: 'high' } } };
      const result = evaluatePerAlertSnoozeConditions(
        [instance],
        buildMap([['alert-1', alertAsData]])
      );
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });

  describe('empty inputs', () => {
    it('returns empty result for empty activeSnoozedInstances', () => {
      const result = evaluatePerAlertSnoozeConditions([], new Map());
      expect(result.conditionExpiredInstances).toHaveLength(0);
    });
  });
});

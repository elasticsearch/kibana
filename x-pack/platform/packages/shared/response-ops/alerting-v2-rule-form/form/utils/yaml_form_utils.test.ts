/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { dump } from 'js-yaml';
import {
  formValuesToYamlObject,
  parseYamlToFormValues,
  serializeFormToYaml,
} from './yaml_form_utils';
import { defaultTestFormValues } from '../../test_utils';
import type { FormValues } from '../types';

describe('yaml_form_utils', () => {
  describe('formValuesToYamlObject', () => {
    it('converts standalone FormValues to YAML-compatible object with snake_case keys', () => {
      const formValues: FormValues = {
        kind: 'alert',
        metadata: {
          name: 'Test Rule',
          enabled: true,
          description: 'A test rule',
          owner: 'test-owner',
          tags: ['label1', 'label2'],
        },
        timeField: '@timestamp',
        schedule: {
          every: '5m',
          lookback: '1m',
        },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* | LIMIT 10' },
        },
        grouping: {
          fields: ['host.name', 'service.name'],
        },
        artifacts: [{ id: 'artifact-1', type: 'host', value: 'host-a' }],
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const result = formValuesToYamlObject(formValues);

      expect(result).toEqual({
        kind: 'alert',
        metadata: {
          name: 'Test Rule',
          description: 'A test rule',
          owner: 'test-owner',
          tags: ['label1', 'label2'],
        },
        time_field: '@timestamp',
        schedule: {
          every: '5m',
          lookback: '1m',
        },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* | LIMIT 10' },
        },
        grouping: {
          fields: ['host.name', 'service.name'],
        },
        artifacts: [{ id: 'artifact-1', type: 'host', value: 'host-a' }],
      });
    });

    it('converts composed FormValues to YAML-compatible object', () => {
      const formValues: FormValues = {
        ...defaultTestFormValues,
        query: {
          format: 'composed',
          base: 'FROM logs-* | STATS c = COUNT(*) BY host.name',
          breach: { segment: 'WHERE c > 100' },
          recovery: { segment: 'WHERE c < 50' },
        },
      };

      const result = formValuesToYamlObject(formValues);

      expect(result.query).toEqual({
        format: 'composed',
        base: 'FROM logs-* | STATS c = COUNT(*) BY host.name',
        breach: { segment: 'WHERE c > 100' },
        recovery: { segment: 'WHERE c < 50' },
      });
      expect(result).toHaveProperty('recovery_strategy', 'query');
    });

    it('excludes optional fields when not provided', () => {
      const formValues: FormValues = {
        kind: 'signal',
        metadata: {
          name: 'Minimal Rule',
          enabled: false,
        },
        timeField: '@timestamp',
        schedule: {
          every: '1m',
          lookback: '5m',
        },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-*' },
        },
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const result = formValuesToYamlObject(formValues);

      expect(result).toEqual({
        kind: 'signal',
        metadata: {
          name: 'Minimal Rule',
        },
        time_field: '@timestamp',
        schedule: {
          every: '1m',
          lookback: '5m',
        },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-*' },
        },
      });
      expect(result).not.toHaveProperty('grouping');
      expect((result.metadata as Record<string, unknown>).description).toBeUndefined();
    });

    it('serializes state_transition when present', () => {
      const formValues: FormValues = {
        ...defaultTestFormValues,
        stateTransition: { pendingCount: 3, recoveringCount: 1 },
      };

      const result = formValuesToYamlObject(formValues);

      expect(result.state_transition).toEqual({
        pending_count: 3,
        recovering_count: 1,
      });
    });

    it('excludes state_transition when not present', () => {
      const formValues: FormValues = { ...defaultTestFormValues };

      const result = formValuesToYamlObject(formValues);

      expect(result).not.toHaveProperty('state_transition');
    });

    it('excludes empty grouping fields array', () => {
      const formValues: FormValues = {
        ...defaultTestFormValues,
        grouping: { fields: [] },
      };

      const result = formValuesToYamlObject(formValues);

      expect(result).not.toHaveProperty('grouping');
    });

    it('sets recovery_strategy when standalone query has recovery', () => {
      const formValues: FormValues = {
        ...defaultTestFormValues,
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-*' },
          recovery: { query: 'FROM logs-* | WHERE ok' },
        },
      };

      const result = formValuesToYamlObject(formValues);

      expect(result).toHaveProperty('recovery_strategy', 'query');
    });
  });

  describe('parseYamlToFormValues', () => {
    it('parses valid YAML with standalone query to FormValues', () => {
      const yaml = dump({
        kind: 'alert',
        metadata: {
          name: 'Test Rule',
          enabled: true,
          description: 'A description',
        },
        time_field: '@timestamp',
        schedule: {
          every: '5m',
          lookback: '1m',
        },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-*' },
        },
        grouping: {
          fields: ['host.name'],
        },
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'artifact-2', type: 'service', value: 'service-a' },
        ],
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values).toEqual({
        kind: 'alert',
        metadata: {
          name: 'Test Rule',
          enabled: true,
          description: 'A description',
          owner: undefined,
          tags: undefined,
        },
        timeField: '@timestamp',
        schedule: {
          every: '5m',
          lookback: '1m',
        },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-*' },
        },
        grouping: {
          fields: ['host.name'],
        },
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'artifact-2', type: 'service', value: 'service-a' },
        ],
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      });
    });

    it('parses composed query YAML to FormValues', () => {
      const yaml = dump({
        kind: 'alert',
        metadata: { name: 'Composed Rule' },
        query: {
          format: 'composed',
          base: 'FROM logs-* | STATS c = COUNT(*) BY host.name',
          breach: { segment: 'WHERE c > 100' },
          recovery: { segment: 'WHERE c < 50' },
        },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.query).toEqual({
        format: 'composed',
        base: 'FROM logs-* | STATS c = COUNT(*) BY host.name',
        breach: { segment: 'WHERE c > 100' },
        recovery: { segment: 'WHERE c < 50' },
      });
    });

    it('accepts bare string breach/recovery for standalone backward compatibility', () => {
      const yaml = dump({
        metadata: { name: 'Bare string' },
        query: {
          format: 'standalone',
          breach: 'FROM logs-*',
          recovery: 'FROM logs-* | WHERE ok',
        },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.query).toEqual({
        format: 'standalone',
        breach: { query: 'FROM logs-*' },
        recovery: { query: 'FROM logs-* | WHERE ok' },
      });
    });

    it('ignores invalid artifacts entries', () => {
      const yaml = dump({
        metadata: { name: 'Rule with mixed artifacts' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        artifacts: [{ id: 'artifact-1', type: 'host', value: 'host-a' }, { id: 1 }, 'bad'],
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.artifacts).toEqual([
        { id: 'artifact-1', type: 'host', value: 'host-a' },
      ]);
    });

    it('returns error for invalid YAML syntax', () => {
      const invalidYaml = 'kind: alert\n  invalid: indentation';

      const result = parseYamlToFormValues(invalidYaml);

      expect(result.values).toBeNull();
      expect(result.error).toContain('Invalid YAML syntax');
    });

    it('returns error for non-object YAML', () => {
      const arrayYaml = '- item1\n- item2';

      const result = parseYamlToFormValues(arrayYaml);

      expect(result.values).toBeNull();
      expect(result.error).toContain('YAML must be an object');
    });

    it('returns error for invalid kind value', () => {
      const yaml = dump({
        kind: 'invalid',
        metadata: { name: 'Test' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.values).toBeNull();
      expect(result.error).toContain('Kind must be "alert" or "signal"');
    });

    it('returns values with empty name when metadata.name is missing', () => {
      const yaml = dump({
        kind: 'alert',
        metadata: {},
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.metadata.name).toBe('');
    });

    it('returns values with trimmed empty name when name is whitespace', () => {
      const yaml = dump({
        kind: 'alert',
        metadata: { name: '   ' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.metadata.name).toBe('');
    });

    it('returns values with empty query when query is missing', () => {
      const yaml = dump({
        kind: 'alert',
        metadata: { name: 'Test' },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.query).toEqual({ format: 'standalone', breach: { query: '' } });
    });

    it('returns values for ES|QL query without validation', () => {
      const yaml = dump({
        kind: 'alert',
        metadata: { name: 'Test' },
        query: { format: 'standalone', breach: { query: 'INVALID query' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      if (result.values?.query.format === 'standalone') {
        expect(result.values.query.breach.query).toBe('INVALID query');
      }
    });

    it('uses default values for missing optional fields', () => {
      const yaml = dump({
        metadata: { name: 'Minimal Rule' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values).toMatchObject({
        kind: 'alert',
        timeField: '@timestamp',
        schedule: {
          every: '5m',
          lookback: '1m',
        },
      });
    });

    it('defaults enabled to true when not specified', () => {
      const yaml = dump({
        metadata: { name: 'Test' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.values?.metadata.enabled).toBe(true);
    });

    it('respects enabled: false', () => {
      const yaml = dump({
        metadata: { name: 'Test', enabled: false },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.values?.metadata.enabled).toBe(false);
    });

    it('trims whitespace from name', () => {
      const yaml = dump({
        metadata: { name: '  Test Rule  ' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.values?.metadata.name).toBe('Test Rule');
    });

    it('derives breaches alert delay mode from state_transition with pending_count', () => {
      const yaml = dump({
        metadata: { name: 'Rule with breaches' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        state_transition: { pending_count: 3 },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.stateTransition).toEqual({
        pendingCount: 3,
        pendingTimeframe: null,
        recoveringCount: null,
        recoveringTimeframe: null,
      });
      expect(result.values?.stateTransitionAlertDelayMode).toBe('breaches');
      expect(result.values?.stateTransitionRecoveryDelayMode).toBe('immediate');
    });

    it('derives duration alert delay mode from state_transition with pending_timeframe', () => {
      const yaml = dump({
        metadata: { name: 'Rule with duration' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        state_transition: { pending_timeframe: '10m' },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.stateTransitionAlertDelayMode).toBe('duration');
      expect(result.values?.stateTransitionRecoveryDelayMode).toBe('immediate');
    });

    it('derives both delay modes from state_transition with pending and recovering fields', () => {
      const yaml = dump({
        metadata: { name: 'Rule with both' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        state_transition: {
          pending_count: 2,
          recovering_timeframe: '15m',
        },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.stateTransition).toEqual({
        pendingCount: 2,
        pendingTimeframe: null,
        recoveringCount: null,
        recoveringTimeframe: '15m',
      });
      expect(result.values?.stateTransitionAlertDelayMode).toBe('breaches');
      expect(result.values?.stateTransitionRecoveryDelayMode).toBe('duration');
    });

    it('defaults both modes to immediate when no state_transition is present', () => {
      const yaml = dump({
        metadata: { name: 'No delay' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
      });

      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.stateTransition).toBeUndefined();
      expect(result.values?.stateTransitionAlertDelayMode).toBe('immediate');
      expect(result.values?.stateTransitionRecoveryDelayMode).toBe('immediate');
    });
  });

  describe('serializeFormToYaml', () => {
    it('serializes FormValues to YAML string', () => {
      const formValues: FormValues = {
        kind: 'alert',
        metadata: {
          name: 'Test',
          enabled: true,
        },
        timeField: '@timestamp',
        schedule: { every: '5m', lookback: '1m' },
        query: { format: 'standalone', breach: { query: 'FROM logs-*' } },
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const yaml = serializeFormToYaml(formValues);

      expect(yaml).toContain('kind: alert');
      expect(yaml).toContain('name: Test');
      expect(yaml).toContain("time_field: '@timestamp'");
    });
  });

  describe('round-trip stability', () => {
    it('parse(serialize(values)) preserves the same FormValues structure (standalone)', () => {
      const original: FormValues = {
        kind: 'alert',
        metadata: { name: 'Round-trip rule', enabled: true, description: 'desc' },
        timeField: '@timestamp',
        schedule: { every: '5m', lookback: '10m' },
        query: {
          format: 'standalone',
          breach: {
            query: 'FROM logs-* | STATS count = COUNT(*) BY host.name | WHERE count > 5',
          },
        },
        stateTransition: { pendingCount: 2, recoveringCount: 2 },
        stateTransitionAlertDelayMode: 'breaches',
        stateTransitionRecoveryDelayMode: 'recoveries',
      };

      const yaml = serializeFormToYaml(original);
      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values).toBeDefined();
      expect(result.values?.kind).toBe(original.kind);
      expect(result.values?.metadata.name).toBe(original.metadata.name);
      expect(result.values?.timeField).toBe(original.timeField);
      expect(result.values?.query).toEqual(original.query);
      expect(result.values?.schedule.every).toBe(original.schedule.every);
      expect(result.values?.schedule.lookback).toBe(original.schedule.lookback);
      expect(result.values?.stateTransition?.pendingCount).toBe(
        original.stateTransition?.pendingCount
      );
      expect(result.values?.stateTransition?.recoveringCount).toBe(
        original.stateTransition?.recoveringCount
      );
    });

    it('parse(serialize(values)) preserves the same FormValues structure (composed)', () => {
      const original: FormValues = {
        kind: 'alert',
        metadata: { name: 'Composed round-trip', enabled: true },
        timeField: '@timestamp',
        schedule: { every: '1m', lookback: '5m' },
        query: {
          format: 'composed',
          base: 'FROM logs-* | STATS c = COUNT(*) BY host.name',
          breach: { segment: 'WHERE c > 100' },
          recovery: { segment: 'WHERE c < 50' },
        },
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const yaml = serializeFormToYaml(original);
      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.query).toEqual(original.query);
    });

    it('parse(serialize(values)) preserves recovery_strategy: no_breach', () => {
      const original: FormValues = {
        kind: 'alert',
        metadata: { name: 'No-breach recovery', enabled: true },
        timeField: '@timestamp',
        schedule: { every: '5m', lookback: '1m' },
        query: {
          format: 'composed',
          base: 'FROM logs-*',
          breach: { segment: 'WHERE c > 100' },
        },
        recoveryStrategy: 'no_breach',
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const yaml = serializeFormToYaml(original);
      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.recoveryStrategy).toBe('no_breach');
    });

    it('parse(serialize(values)) preserves no_data_strategy', () => {
      const original: FormValues = {
        kind: 'alert',
        metadata: { name: 'No-data emit', enabled: true },
        timeField: '@timestamp',
        schedule: { every: '5m', lookback: '1m' },
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* | WHERE level == "error"' },
          recovery: { query: 'FROM logs-* | WHERE level != "error"' },
          no_data: { query: 'FROM logs-* | STATS c = COUNT(*)' },
        },
        recoveryStrategy: 'query',
        noDataStrategy: 'emit',
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const yaml = serializeFormToYaml(original);
      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.noDataStrategy).toBe('emit');
      expect(result.values?.recoveryStrategy).toBe('query');
      expect(result.values?.query).toEqual(original.query);
    });

    it('parse(serialize(values)) preserves recovery_strategy: none', () => {
      const original: FormValues = {
        kind: 'alert',
        metadata: { name: 'Recovery none', enabled: true },
        timeField: '@timestamp',
        schedule: { every: '5m', lookback: '1m' },
        query: {
          format: 'composed',
          base: 'FROM logs-*',
          breach: { segment: 'WHERE c > 100' },
        },
        recoveryStrategy: 'none',
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'immediate',
      };

      const yaml = serializeFormToYaml(original);
      const result = parseYamlToFormValues(yaml);

      expect(result.error).toBeNull();
      expect(result.values?.recoveryStrategy).toBe('none');
    });
  });
});

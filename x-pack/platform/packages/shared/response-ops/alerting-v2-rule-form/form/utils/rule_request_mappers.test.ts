/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { DASHBOARD_ARTIFACT_TYPE, RUNBOOK_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import type { FormValues } from '../types';
import {
  mapFormValuesToRuleRequest,
  mapFormValuesToCreateRequest,
  mapFormValuesToUpdateRequest,
  mapRuleResponseToFormValues,
} from './rule_request_mappers';
import type { RuleRequestCommon } from './rule_request_mappers';

describe('rule_request_mappers', () => {
  const baseFormValues: FormValues = {
    kind: 'signal',
    metadata: {
      name: 'Test Rule',
      enabled: true,
      owner: 'test-owner',
      tags: ['tag1', 'tag2'],
    },
    timeField: '@timestamp',
    schedule: { every: '5m', lookback: '1m' },
    query: {
      format: 'standalone',
      breach: { query: 'FROM logs-* | LIMIT 10' },
    },
    stateTransitionAlertDelayMode: 'immediate',
    stateTransitionRecoveryDelayMode: 'immediate',
  };

  describe('mapFormValuesToRuleRequest', () => {
    it('maps basic form values to the common API shape', () => {
      const result = mapFormValuesToRuleRequest(baseFormValues);

      expect(result).toEqual({
        metadata: { name: 'Test Rule', owner: 'test-owner', tags: ['tag1', 'tag2'] },
        time_field: '@timestamp',
        schedule: { every: '5m', lookback: '1m' },
        query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } },
        grouping: undefined,
        state_transition: undefined,
      });
    });

    it('does not include kind in the common shape', () => {
      const result = mapFormValuesToRuleRequest(baseFormValues);

      expect(result).not.toHaveProperty('kind');
    });

    it('maps grouping fields when present', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        grouping: { fields: ['host.name', 'service.name'] },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.grouping).toEqual({ fields: ['host.name', 'service.name'] });
    });

    it('returns undefined grouping when fields array is empty', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        grouping: { fields: [] },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.grouping).toBeUndefined();
    });

    it('maps state_transition for alert kind with pending count and timeframe', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransitionAlertDelayMode: 'duration',
        stateTransitionRecoveryDelayMode: 'immediate',
        stateTransition: { pendingCount: 3, pendingTimeframe: '10m' },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({
        pending_count: 3,
        pending_timeframe: '10m',
        recovering_count: 0,
      });
    });

    it('maps state_transition with only pending count (no timeframe)', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransitionAlertDelayMode: 'breaches',
        stateTransitionRecoveryDelayMode: 'immediate',
        stateTransition: { pendingCount: 5 },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({ pending_count: 5, recovering_count: 0 });
      expect(result.state_transition).not.toHaveProperty('pending_timeframe');
    });

    it('returns undefined state_transition for signal kind even with stateTransition data', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'signal',
        stateTransition: { pendingCount: 3, pendingTimeframe: '10m' },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toBeUndefined();
    });

    it('emits pending_count: 0 and recovering_count: 0 for alert kind when both modes are immediate', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransition: {},
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({ pending_count: 0, recovering_count: 0 });
    });

    it('emits pending_count: 0 and recovering_count: 0 for alert kind when stateTransition is undefined', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({ pending_count: 0, recovering_count: 0 });
    });

    it('emits pending_count: 0 when alert delay mode is immediate even if pendingCount is stale', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'recoveries',
        stateTransition: {
          pendingCount: 2,
          pendingTimeframe: null,
          recoveringCount: 3,
          recoveringTimeframe: null,
        },
      };

      expect(mapFormValuesToUpdateRequest(formValues).state_transition).toEqual({
        pending_count: 0,
        recovering_count: 3,
      });
    });

    it('maps state_transition with recovering count and timeframe', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'duration',
        stateTransition: { recoveringCount: 4, recoveringTimeframe: '15m' },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({
        pending_count: 0,
        recovering_count: 4,
        recovering_timeframe: '15m',
      });
    });

    it('maps state_transition with only recovering count (no timeframe)', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransitionAlertDelayMode: 'immediate',
        stateTransitionRecoveryDelayMode: 'recoveries',
        stateTransition: { recoveringCount: 3 },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({ pending_count: 0, recovering_count: 3 });
      expect(result.state_transition).not.toHaveProperty('recovering_timeframe');
    });

    it('maps state_transition with both pending and recovering fields', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        stateTransitionAlertDelayMode: 'breaches',
        stateTransitionRecoveryDelayMode: 'duration',
        stateTransition: {
          pendingCount: 2,
          recoveringCount: 5,
          recoveringTimeframe: '10m',
        },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.state_transition).toEqual({
        pending_count: 2,
        recovering_count: 5,
        recovering_timeframe: '10m',
      });
    });

    it('strips enabled from metadata (server-managed) but includes description', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        metadata: {
          name: 'My Rule',
          enabled: false,
          description: 'A description',
          owner: 'owner',
          tags: [],
        },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.metadata).toEqual({
        name: 'My Rule',
        description: 'A description',
        owner: 'owner',
      });
      expect(result.metadata).not.toHaveProperty('enabled');
      expect(result.metadata).not.toHaveProperty('tags');
    });

    it('passes artifacts through to API request', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [{ id: 'artifact-1', type: 'host', value: 'host-a' }],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([{ id: 'artifact-1', type: 'host', value: 'host-a' }]);
    });

    it('merges split artifact fields into API request', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [{ id: 'artifact-1', type: 'host', value: 'host-a' }],
        runbookArtifacts: [
          { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: 'Runbook steps' },
        ],
        dashboardArtifacts: [
          { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: 'dashboard-123' },
        ],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([
        { id: 'artifact-1', type: 'host', value: 'host-a' },
        { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: 'Runbook steps' },
        { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: 'dashboard-123' },
      ]);
    });

    it('replaces existing runbook artifact value while preserving artifact id', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'existing-runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: '  Existing runbook  ' },
        ],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([
        { id: 'artifact-1', type: 'host', value: 'host-a' },
        { id: 'existing-runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: 'Existing runbook' },
      ]);
    });

    it('removes empty runbook artifact and keeps other artifacts', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: '   ' },
        ],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([{ id: 'artifact-1', type: 'host', value: 'host-a' }]);
    });

    it('omits artifacts when only runbook artifact is empty', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [{ id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: '   ' }],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toBeUndefined();
    });

    it('omits artifacts when artifacts are empty', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toBeUndefined();
    });

    it('omits artifacts when artifacts are undefined', () => {
      const result = mapFormValuesToRuleRequest(baseFormValues);

      expect(result.artifacts).toBeUndefined();
    });

    it('maps recovery query and sets recovery_strategy: "query"', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        query: {
          format: 'standalone',
          breach: { query: 'FROM logs-* | LIMIT 10' },
          recovery: { query: 'FROM logs-* | WHERE ok == true' },
        },
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.query).toEqual({
        format: 'standalone',
        breach: { query: 'FROM logs-* | LIMIT 10' },
        recovery: { query: 'FROM logs-* | WHERE ok == true' },
      });
      expect(result.recovery_strategy).toBe('query');
    });

    it('omits recovery_strategy when query.recovery is absent', () => {
      const result = mapFormValuesToRuleRequest(baseFormValues);

      expect(result.recovery_strategy).toBeUndefined();
    });

    it('keeps non-empty runbook artifact value unchanged', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: 'Valid runbook' },
        ],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([
        { id: 'artifact-1', type: 'host', value: 'host-a' },
        { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: 'Valid runbook' },
      ]);
    });

    it('creates runbook artifact id when runbook artifact id is empty', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [{ id: '', type: RUNBOOK_ARTIFACT_TYPE, value: 'Runbook with missing id' }],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0]).toEqual({
        id: expect.stringMatching(/^runbook-\d+-[a-z0-9]+$/),
        type: RUNBOOK_ARTIFACT_TYPE,
        value: 'Runbook with missing id',
      });
    });

    it('trims dashboard artifact value while preserving artifact id', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: '  dashboard-123  ' },
        ],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([
        { id: 'artifact-1', type: 'host', value: 'host-a' },
        { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: 'dashboard-123' },
      ]);
    });

    it('removes empty dashboard artifact and keeps other artifacts', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: '   ' },
        ],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toEqual([{ id: 'artifact-1', type: 'host', value: 'host-a' }]);
    });

    it('creates dashboard artifact id when dashboard artifact id is empty', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [{ id: '', type: DASHBOARD_ARTIFACT_TYPE, value: 'dashboard-123' }],
      };

      const result = mapFormValuesToRuleRequest(formValues);

      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts?.[0]).toEqual({
        id: expect.stringMatching(/^dashboard-\d+-[a-z0-9]+$/),
        type: DASHBOARD_ARTIFACT_TYPE,
        value: 'dashboard-123',
      });
    });
  });

  describe('mapFormValuesToCreateRequest', () => {
    it('includes kind along with the common request shape', () => {
      const result = mapFormValuesToCreateRequest(baseFormValues);

      expect(result.kind).toBe('signal');
      expect(result.metadata).toEqual({
        name: 'Test Rule',
        owner: 'test-owner',
        tags: ['tag1', 'tag2'],
      });
      expect(result.time_field).toBe('@timestamp');
    });

    it('includes description in the create request when provided', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        metadata: {
          ...baseFormValues.metadata,
          description: 'Create rule description',
        },
      };

      const result = mapFormValuesToCreateRequest(formValues);

      expect(result.metadata.description).toBe('Create rule description');
    });

    it('produces a superset of mapFormValuesToRuleRequest', () => {
      const common = mapFormValuesToRuleRequest(baseFormValues);
      const create = mapFormValuesToCreateRequest(baseFormValues);
      const createRequest = create as typeof create & {
        artifacts?: RuleRequestCommon['artifacts'];
      };

      // Every key in common should be present in create with the same value
      for (const key of Object.keys(common) as Array<keyof typeof common>) {
        expect(createRequest[key]).toEqual(common[key]);
      }
    });
  });

  describe('mapFormValuesToUpdateRequest', () => {
    it('coerces undefined optional fields to null for explicit removal', () => {
      const result = mapFormValuesToUpdateRequest(baseFormValues);
      const updateRequest = result as typeof result & {
        artifacts?: RuleRequestCommon['artifacts'] | null;
      };

      expect(updateRequest.grouping).toBeNull();
      expect(updateRequest.state_transition).toBeNull();
      expect(updateRequest.artifacts).toBeNull();
      expect(updateRequest.recovery_strategy).toBeNull();
      expect(updateRequest.no_data_strategy).toBeNull();
    });

    it('does not include kind in the update payload', () => {
      const result = mapFormValuesToUpdateRequest(baseFormValues);

      expect(result).not.toHaveProperty('kind');
    });

    it('passes through present optional fields without coercion', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        kind: 'alert',
        grouping: { fields: ['host.name'] },
        recoveryStrategy: 'no_breach',
        noDataStrategy: 'emit',
        stateTransitionAlertDelayMode: 'duration',
        stateTransitionRecoveryDelayMode: 'immediate',
        stateTransition: { pendingCount: 2, pendingTimeframe: '5m' },
      };

      const result = mapFormValuesToUpdateRequest(formValues);

      expect(result.grouping).toEqual({ fields: ['host.name'] });
      expect(result.recovery_strategy).toBe('no_breach');
      expect(result.no_data_strategy).toBe('emit');
      expect(result.state_transition).toEqual({
        pending_count: 2,
        pending_timeframe: '5m',
        recovering_count: 0,
      });
    });

    it('nullifies empty grouping fields instead of leaving as undefined', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        grouping: { fields: [] },
      };

      const result = mapFormValuesToUpdateRequest(formValues);

      // Empty fields → mapGrouping returns undefined → coerced to null
      expect(result.grouping).toBeNull();
    });

    it('includes required fields from the common mapper', () => {
      const result = mapFormValuesToUpdateRequest(baseFormValues);

      expect(result.metadata).toEqual({
        name: 'Test Rule',
        owner: 'test-owner',
        tags: ['tag1', 'tag2'],
      });
      expect(result.time_field).toBe('@timestamp');
      expect(result.schedule).toEqual({ every: '5m', lookback: '1m' });
      expect(result.query).toEqual({
        format: 'standalone',
        breach: { query: 'FROM logs-* | LIMIT 10' },
      });
    });

    it('coerces empty artifacts array to null for explicit removal', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        artifacts: [],
      };

      const result = mapFormValuesToUpdateRequest(formValues);

      expect(result.artifacts).toBeNull();
    });

    it('infers recovery_strategy: query when user adds recovery via form (recoveryStrategy undefined)', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        query: {
          format: 'composed',
          base: 'FROM logs-*',
          breach: { segment: 'WHERE count > 100' },
          recovery: { segment: 'WHERE count < 50' },
        },
      };

      const result = mapFormValuesToUpdateRequest(formValues);

      expect(result.recovery_strategy).toBe('query');
    });

    it('nullifies recovery_strategy when user removes recovery from a loaded rule', () => {
      const formValues: FormValues = {
        ...baseFormValues,
        recoveryStrategy: 'query',
      };

      const result = mapFormValuesToUpdateRequest(formValues);

      expect(result.recovery_strategy).toBeNull();
    });
  });

  describe('mapRuleResponseToFormValues', () => {
    const baseRuleResponse: RuleResponse = {
      id: 'rule-1',
      kind: 'alert',
      enabled: true,
      metadata: {
        name: 'Test Rule',
        owner: 'test-owner',
        tags: ['tag1'],
      },
      time_field: '@timestamp',
      schedule: {
        every: '5m',
        lookback: '2m',
      },
      query: {
        format: 'standalone',
        breach: { query: 'FROM logs-* | STATS count() BY host' },
      },
    } as RuleResponse;

    it('maps basic required fields', () => {
      const result = mapRuleResponseToFormValues(baseRuleResponse);

      expect(result.kind).toBe('alert');
      expect(result.timeField).toBe('@timestamp');
      expect(result.metadata).toEqual({
        name: 'Test Rule',
        enabled: true,
        owner: 'test-owner',
        tags: ['tag1'],
      });
      expect(result.stateTransitionAlertDelayMode).toBe('immediate');
      expect(result.stateTransitionRecoveryDelayMode).toBe('immediate');
    });

    it('maps description from the API response', () => {
      const rule = {
        ...baseRuleResponse,
        metadata: { ...baseRuleResponse.metadata, description: 'A rule description' },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.metadata?.description).toBe('A rule description');
    });

    it('leaves description undefined when not present in the API response', () => {
      const result = mapRuleResponseToFormValues(baseRuleResponse);

      expect(result.metadata?.description).toBeUndefined();
    });

    it('maps schedule with existing lookback', () => {
      const result = mapRuleResponseToFormValues(baseRuleResponse);

      expect(result.schedule).toEqual({ every: '5m', lookback: '2m' });
    });

    it('defaults lookback to 1m when not present in response', () => {
      const rule = {
        ...baseRuleResponse,
        schedule: { every: '10m' },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.schedule).toEqual({ every: '10m', lookback: '1m' });
    });

    it('maps query to RuleQuery shape', () => {
      const result = mapRuleResponseToFormValues(baseRuleResponse);

      expect(result.query).toEqual({
        format: 'standalone',
        breach: { query: 'FROM logs-* | STATS count() BY host' },
      });
    });

    it('maps grouping when present', () => {
      const rule = {
        ...baseRuleResponse,
        grouping: { fields: ['host.name', 'service.name'] },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.grouping).toEqual({ fields: ['host.name', 'service.name'] });
    });

    it('omits grouping when not present in response', () => {
      const result = mapRuleResponseToFormValues(baseRuleResponse);

      expect(result).not.toHaveProperty('grouping');
    });

    it('maps state_transition when present', () => {
      const rule = {
        ...baseRuleResponse,
        state_transition: { pending_count: 3, pending_timeframe: '10m' },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.stateTransition).toEqual({
        pendingCount: 3,
        pendingTimeframe: '10m',
        recoveringCount: null,
        recoveringTimeframe: null,
      });
      expect(result.stateTransitionAlertDelayMode).toBe('duration');
      expect(result.stateTransitionRecoveryDelayMode).toBe('immediate');
    });

    it('maps state_transition with recovering fields', () => {
      const rule = {
        ...baseRuleResponse,
        state_transition: { recovering_count: 5, recovering_timeframe: '15m' },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.stateTransition).toEqual({
        pendingCount: null,
        pendingTimeframe: null,
        recoveringCount: 5,
        recoveringTimeframe: '15m',
      });
      expect(result.stateTransitionAlertDelayMode).toBe('immediate');
      expect(result.stateTransitionRecoveryDelayMode).toBe('duration');
    });

    it('maps state_transition with both pending and recovering fields', () => {
      const rule = {
        ...baseRuleResponse,
        state_transition: {
          pending_count: 2,
          recovering_count: 4,
          recovering_timeframe: '20m',
        },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.stateTransition).toEqual({
        pendingCount: 2,
        pendingTimeframe: null,
        recoveringCount: 4,
        recoveringTimeframe: '20m',
      });
      expect(result.stateTransitionAlertDelayMode).toBe('breaches');
      expect(result.stateTransitionRecoveryDelayMode).toBe('duration');
    });

    it('initializes stateTransition with null fields when not present in response', () => {
      const result = mapRuleResponseToFormValues(baseRuleResponse);

      expect(result.stateTransition).toEqual({
        pendingCount: null,
        pendingTimeframe: null,
        recoveringCount: null,
        recoveringTimeframe: null,
      });
      expect(result.stateTransitionAlertDelayMode).toBe('immediate');
      expect(result.stateTransitionRecoveryDelayMode).toBe('immediate');
    });

    it('treats pending_count: 0 and recovering_count: 0 as immediate mode', () => {
      const rule = {
        ...baseRuleResponse,
        state_transition: { pending_count: 0, recovering_count: 0 },
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.stateTransition).toEqual({
        pendingCount: 0,
        pendingTimeframe: null,
        recoveringCount: 0,
        recoveringTimeframe: null,
      });
      expect(result.stateTransitionAlertDelayMode).toBe('immediate');
      expect(result.stateTransitionRecoveryDelayMode).toBe('immediate');
    });

    it('splits artifacts by field ownership when present', () => {
      const rule = {
        ...baseRuleResponse,
        artifacts: [
          { id: 'artifact-1', type: 'host', value: 'host-a' },
          { id: 'runbook-id', type: 'runbook', value: 'Runbook from API' },
          { id: 'dashboard-id', type: 'dashboard', value: 'dashboard-123' },
        ],
      } as RuleResponse;

      const result = mapRuleResponseToFormValues(rule);

      expect(result.artifacts).toEqual([{ id: 'artifact-1', type: 'host', value: 'host-a' }]);
      expect(result.runbookArtifacts).toEqual([
        { id: 'runbook-id', type: 'runbook', value: 'Runbook from API' },
      ]);
      expect(result.dashboardArtifacts).toEqual([
        { id: 'dashboard-id', type: 'dashboard', value: 'dashboard-123' },
      ]);
    });

    it('roundtrips: create request from mapped response matches original API payload', () => {
      const fullRule = {
        ...baseRuleResponse,
        metadata: { ...baseRuleResponse.metadata, description: 'Roundtrip description' },
        grouping: { fields: ['host.name'] },
        state_transition: { pending_count: 3, pending_timeframe: '10m' },
      } as RuleResponse;

      const formValues = mapRuleResponseToFormValues(fullRule);

      // Fill in required fields that mapRuleResponseToFormValues returns
      const completeFormValues: FormValues = {
        kind: formValues.kind!,
        metadata: formValues.metadata!,
        timeField: formValues.timeField!,
        schedule: formValues.schedule as FormValues['schedule'],
        query: formValues.query!,
        grouping: formValues.grouping,
        stateTransition: formValues.stateTransition,
        stateTransitionAlertDelayMode: formValues.stateTransitionAlertDelayMode!,
        stateTransitionRecoveryDelayMode: formValues.stateTransitionRecoveryDelayMode!,
        artifacts: formValues.artifacts,
        runbookArtifacts: formValues.runbookArtifacts,
        dashboardArtifacts: formValues.dashboardArtifacts,
      };

      const createPayload = mapFormValuesToCreateRequest(completeFormValues);

      expect(createPayload.kind).toBe('alert');
      expect(createPayload.metadata.description).toBe('Roundtrip description');
      expect(createPayload.query).toEqual({
        format: 'standalone',
        breach: { query: 'FROM logs-* | STATS count() BY host' },
      });
      expect(createPayload.grouping).toEqual({ fields: ['host.name'] });
      expect(createPayload.state_transition).toEqual({
        pending_count: 3,
        pending_timeframe: '10m',
        recovering_count: 0,
      });
    });
  });
});

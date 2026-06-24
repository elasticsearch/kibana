/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleResponse } from '@kbn/alerting-v2-schemas';
import { DASHBOARD_ARTIFACT_TYPE, RUNBOOK_ARTIFACT_TYPE } from '@kbn/alerting-v2-constants';
import type { FormValues } from '../../form/types';
import type { ComposeFormValues } from './compose_form_types';
import {
  composeFormToCreateRequest,
  composeFormToUpdateRequest,
  mapRuleToComposeFormValues,
  mapYamlFormValuesToComposeFormValues,
} from './compose_mappers';

// ── fixtures ─────────────────────────────────────────────────────────────────

const BASE = 'FROM logs-*\n| STATS count = COUNT(*) BY host.name';
const ALERT_SEGMENT = 'WHERE count > 100';
const RECOVERY_SEGMENT = 'WHERE count < 100';

const baseRuleResponse: RuleResponse = {
  id: 'rule-1',
  kind: 'alert',
  enabled: true,
  metadata: { name: 'Test Rule', owner: 'test-owner', tags: ['tag1'] },
  time_field: '@timestamp',
  schedule: { every: '5m', lookback: '2m' },
  query: {
    format: 'composed',
    base: BASE,
    breach: { segment: ALERT_SEGMENT },
  },
  createdBy: 'test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedBy: 'test',
  updatedAt: '2026-01-01T00:00:00Z',
};

const baseFormValues: ComposeFormValues = {
  kind: 'alert',
  metadata: { name: 'Test Rule', enabled: true, owner: 'test-owner', tags: ['tag1'] },
  timeField: '@timestamp',
  schedule: { every: '5m', lookback: '2m' },
  query: {
    format: 'composed',
    base: BASE,
    breach: { segment: ALERT_SEGMENT },
  },
  stateTransitionAlertDelayMode: 'immediate',
  stateTransitionRecoveryDelayMode: 'immediate',
};

// ── composeFormToCreateRequest ───────────────────────────────────────────────

describe('composeFormToCreateRequest', () => {
  it('maps basic form values to create request', () => {
    const result = composeFormToCreateRequest(baseFormValues);
    expect(result.kind).toBe('alert');
    expect(result.metadata).toEqual({ name: 'Test Rule', owner: 'test-owner', tags: ['tag1'] });
    expect(result.time_field).toBe('@timestamp');
    expect(result.schedule).toEqual({ every: '5m', lookback: '2m' });
    expect(result.query).toEqual({
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
    });
  });

  it('includes recovery with recovery_strategy: query when form has recovery segment', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      query: {
        format: 'composed',
        base: BASE,
        breach: { segment: ALERT_SEGMENT },
        recovery: { segment: RECOVERY_SEGMENT },
      },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.query).toEqual({
      format: 'composed',
      base: BASE,
      breach: { segment: ALERT_SEGMENT },
      recovery: { segment: RECOVERY_SEGMENT },
    });
    expect(result.recovery_strategy).toBe('query');
  });

  it('omits recovery and recovery_strategy when form has none', () => {
    const result = composeFormToCreateRequest(baseFormValues);
    expect(result.query).not.toHaveProperty('recovery');
    expect(result.recovery_strategy).toBeUndefined();
  });

  it('maps standalone form values to standalone request', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      query: {
        format: 'standalone',
        breach: { query: 'FROM logs-* | WHERE count > 100' },
        recovery: { query: 'FROM logs-* | WHERE count < 100' },
      },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.query).toEqual({
      format: 'standalone',
      breach: { query: 'FROM logs-* | WHERE count > 100' },
      recovery: { query: 'FROM logs-* | WHERE count < 100' },
    });
    expect(result.recovery_strategy).toBe('query');
  });

  it('omits tags when empty', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      metadata: { ...baseFormValues.metadata, tags: [] },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.metadata.tags).toBeUndefined();
  });

  it('maps grouping when present', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      grouping: { fields: ['host.name'] },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.grouping).toEqual({ fields: ['host.name'] });
  });

  it('omits grouping when fields are empty', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      grouping: { fields: [] },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.grouping).toBeUndefined();
  });

  it('returns undefined state_transition for signal rules', () => {
    const values: ComposeFormValues = { ...baseFormValues, kind: 'signal' };
    const result = composeFormToCreateRequest(values);
    expect(result.state_transition).toBeUndefined();
  });

  it('maps state_transition for immediate delay mode', () => {
    const result = composeFormToCreateRequest(baseFormValues);
    expect(result.state_transition).toEqual({ pending_count: 0, recovering_count: 0 });
  });

  it('maps state_transition for breaches delay mode', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      stateTransitionAlertDelayMode: 'breaches',
      stateTransition: { pendingCount: 5 },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.state_transition).toEqual(expect.objectContaining({ pending_count: 5 }));
  });

  it('maps state_transition for duration delay mode', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      stateTransitionAlertDelayMode: 'duration',
      stateTransition: { pendingCount: 3, pendingTimeframe: '10m' },
    };
    const result = composeFormToCreateRequest(values);
    expect(result.state_transition).toEqual(
      expect.objectContaining({ pending_count: 3, pending_timeframe: '10m' })
    );
  });

  it('trims runbook and dashboard artifacts', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      runbookArtifacts: [
        { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: '  Runbook steps  ' },
      ],
      dashboardArtifacts: [
        { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: '  dashboard-123  ' },
      ],
    };

    const result = composeFormToCreateRequest(values);

    expect(result.artifacts).toEqual([
      { id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: 'Runbook steps' },
      { id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: 'dashboard-123' },
    ]);
  });

  it('removes empty runbook and dashboard artifacts while preserving other artifacts', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      runbookArtifacts: [{ id: 'runbook-id', type: RUNBOOK_ARTIFACT_TYPE, value: '   ' }],
      dashboardArtifacts: [{ id: 'dashboard-id', type: DASHBOARD_ARTIFACT_TYPE, value: '' }],
      artifacts: [{ id: 'other-id', type: 'other', value: 'kept' }],
    };

    const result = composeFormToCreateRequest(values);

    expect(result.artifacts).toEqual([{ id: 'other-id', type: 'other', value: 'kept' }]);
  });

  it('generates missing IDs for runbook and dashboard artifacts', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      runbookArtifacts: [{ id: '', type: RUNBOOK_ARTIFACT_TYPE, value: 'Runbook steps' }],
      dashboardArtifacts: [{ id: '', type: DASHBOARD_ARTIFACT_TYPE, value: 'dashboard-123' }],
    };

    const result = composeFormToCreateRequest(values);

    expect(result.artifacts).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^runbook-/),
        type: RUNBOOK_ARTIFACT_TYPE,
        value: 'Runbook steps',
      }),
      expect.objectContaining({
        id: expect.stringMatching(/^dashboard-/),
        type: DASHBOARD_ARTIFACT_TYPE,
        value: 'dashboard-123',
      }),
    ]);
  });
});

// ── composeFormToUpdateRequest ───────────────────────────────────────────────

describe('composeFormToUpdateRequest', () => {
  it('excludes kind from update request', () => {
    const result = composeFormToUpdateRequest(baseFormValues);
    expect(result).not.toHaveProperty('kind');
  });

  it('nullifies optional fields when absent', () => {
    const result = composeFormToUpdateRequest(baseFormValues);
    expect(result.grouping).toBeNull();
    expect(result.artifacts).toBeNull();
    expect(result.recovery_strategy).toBeNull();
    expect(result.no_data_strategy).toBeNull();
  });

  it('preserves grouping when present', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      grouping: { fields: ['host.name'] },
    };
    const result = composeFormToUpdateRequest(values);
    expect(result.grouping).toEqual({ fields: ['host.name'] });
  });

  it('preserves recovery_strategy and no_data_strategy when present', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      recoveryStrategy: 'no_breach',
      noDataStrategy: 'emit',
    };
    const result = composeFormToUpdateRequest(values);
    expect(result.recovery_strategy).toBe('no_breach');
    expect(result.no_data_strategy).toBe('emit');
  });

  it('infers recovery_strategy: query when user adds recovery via form (recoveryStrategy undefined)', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      query: {
        format: 'composed',
        base: BASE,
        breach: { segment: ALERT_SEGMENT },
        recovery: { segment: RECOVERY_SEGMENT },
      },
    };
    const result = composeFormToUpdateRequest(values);
    expect(result.recovery_strategy).toBe('query');
  });

  it('nullifies recovery_strategy when user removes recovery from a loaded rule', () => {
    const values: ComposeFormValues = {
      ...baseFormValues,
      recoveryStrategy: 'query',
    };
    const result = composeFormToUpdateRequest(values);
    expect(result.recovery_strategy).toBeNull();
  });
});

// ── mapRuleToComposeFormValues ───────────────────────────────────────────────

describe('mapRuleToComposeFormValues', () => {
  it('maps basic required fields', () => {
    const result = mapRuleToComposeFormValues(baseRuleResponse);
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

  it('maps schedule with lookback', () => {
    const result = mapRuleToComposeFormValues(baseRuleResponse);
    expect(result.schedule).toEqual({ every: '5m', lookback: '2m' });
  });

  it('defaults lookback to 1m when absent', () => {
    const rule = { ...baseRuleResponse, schedule: { every: '10m' } } as RuleResponse;
    const result = mapRuleToComposeFormValues(rule);
    expect(result.schedule.lookback).toBe('1m');
  });

  it('maps composed query from rule response', () => {
    const result = mapRuleToComposeFormValues(baseRuleResponse);
    expect(result.query.format).toBe('composed');
    if (result.query.format === 'composed') {
      expect(result.query.base).toBe(BASE);
      expect(result.query.breach.segment).toBe(ALERT_SEGMENT);
    }
  });

  it('maps recovery segment from composed query when recovery_strategy: query', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'query',
      query: {
        format: 'composed',
        base: BASE,
        breach: { segment: ALERT_SEGMENT },
        recovery: { segment: RECOVERY_SEGMENT },
      },
    };
    const result = mapRuleToComposeFormValues(rule);
    if (result.query.format === 'composed') {
      expect(result.query.recovery?.segment).toBe(RECOVERY_SEGMENT);
    }
  });

  it('omits recovery when absent from query', () => {
    const result = mapRuleToComposeFormValues(baseRuleResponse);
    if (result.query.format === 'composed') {
      expect(result.query.recovery).toBeUndefined();
    }
  });

  it('omits recovery when recovery_strategy is no_breach (form does not surface it)', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'no_breach',
      query: {
        format: 'composed',
        base: BASE,
        breach: { segment: ALERT_SEGMENT },
      },
    };
    const result = mapRuleToComposeFormValues(rule);
    if (result.query.format === 'composed') {
      expect(result.query.recovery).toBeUndefined();
    }
  });

  it('maps standalone query from rule response', () => {
    const rule = {
      ...baseRuleResponse,
      query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } },
    } as RuleResponse;
    const result = mapRuleToComposeFormValues(rule);
    expect(result.query).toEqual({
      format: 'standalone',
      breach: { query: 'FROM logs-* | LIMIT 10' },
    });
  });

  it('maps standalone query with recovery', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'query',
      query: {
        format: 'standalone',
        breach: { query: 'FROM logs-*' },
        recovery: { query: 'FROM logs-* | WHERE status == "ok"' },
      },
    };
    const result = mapRuleToComposeFormValues(rule);
    expect(result.query).toEqual({
      format: 'standalone',
      breach: { query: 'FROM logs-*' },
      recovery: { query: 'FROM logs-* | WHERE status == "ok"' },
    });
  });

  it('maps grouping when present', () => {
    const rule = {
      ...baseRuleResponse,
      grouping: { fields: ['host.name'] },
    } as RuleResponse;
    const result = mapRuleToComposeFormValues(rule);
    expect(result.grouping).toEqual({ fields: ['host.name'] });
  });

  it('omits grouping when absent', () => {
    const result = mapRuleToComposeFormValues(baseRuleResponse);
    expect(result.grouping).toBeUndefined();
  });

  it('maps state_transition and derives delay modes', () => {
    const rule = {
      ...baseRuleResponse,
      state_transition: { pending_count: 3, pending_timeframe: '10m' },
    } as RuleResponse;
    const result = mapRuleToComposeFormValues(rule);
    expect(result.stateTransition).toEqual({
      pendingCount: 3,
      pendingTimeframe: '10m',
      recoveringCount: null,
      recoveringTimeframe: null,
    });
    expect(result.stateTransitionAlertDelayMode).toBe('duration');
    expect(result.stateTransitionRecoveryDelayMode).toBe('immediate');
  });

  it('sets stateTransition to undefined when absent from response', () => {
    const result = mapRuleToComposeFormValues(baseRuleResponse);
    expect(result.stateTransition).toBeUndefined();
  });

  it('splits artifacts by field ownership when present', () => {
    const rule = {
      ...baseRuleResponse,
      artifacts: [
        { id: 'host-id', type: 'host', value: 'host-a' },
        { id: 'runbook-id', type: 'runbook', value: 'steps here' },
        { id: 'dashboard-id', type: 'dashboard', value: 'dashboard-123' },
      ],
    } as RuleResponse;
    const result = mapRuleToComposeFormValues(rule);
    expect(result.artifacts).toEqual([{ id: 'host-id', type: 'host', value: 'host-a' }]);
    expect(result.runbookArtifacts).toEqual([
      { id: 'runbook-id', type: 'runbook', value: 'steps here' },
    ]);
    expect(result.dashboardArtifacts).toEqual([
      { id: 'dashboard-id', type: 'dashboard', value: 'dashboard-123' },
    ]);
  });

  it('derives recoveries delay mode from recovering_count', () => {
    const rule = {
      ...baseRuleResponse,
      state_transition: { recovering_count: 5 },
    } as RuleResponse;
    const result = mapRuleToComposeFormValues(rule);
    expect(result.stateTransitionRecoveryDelayMode).toBe('recoveries');
  });

  it('preserves recovery_strategy from API response', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'no_breach',
    };
    const result = mapRuleToComposeFormValues(rule);
    expect(result.recoveryStrategy).toBe('no_breach');
  });

  it('preserves no_data_strategy from API response', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      no_data_strategy: 'emit',
    };
    const result = mapRuleToComposeFormValues(rule);
    expect(result.noDataStrategy).toBe('emit');
  });

  it('preserves no_data query block for standalone queries', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      no_data_strategy: 'emit',
      query: {
        format: 'standalone',
        breach: { query: 'FROM logs-* | WHERE level == "error"' },
        no_data: { query: 'FROM logs-* | STATS c = COUNT(*)' },
      },
    };
    const result = mapRuleToComposeFormValues(rule);
    expect(result.query).toEqual({
      format: 'standalone',
      breach: { query: 'FROM logs-* | WHERE level == "error"' },
      no_data: { query: 'FROM logs-* | STATS c = COUNT(*)' },
    });
  });
});

describe('round-trip: non-representable fields survive load → save', () => {
  it('preserves recovery_strategy: no_breach through load → save cycle', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'no_breach',
    };
    const formValues = mapRuleToComposeFormValues(rule);
    const request = composeFormToCreateRequest(formValues);
    expect(request.recovery_strategy).toBe('no_breach');
  });

  it('preserves no_data_strategy through load → save cycle', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      no_data_strategy: 'emit',
    };
    const formValues = mapRuleToComposeFormValues(rule);
    const request = composeFormToCreateRequest(formValues);
    expect(request.no_data_strategy).toBe('emit');
  });

  it('preserves no_data query block through load → save cycle', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'query',
      no_data_strategy: 'emit',
      query: {
        format: 'standalone',
        breach: { query: 'FROM logs-* | WHERE status == "error"' },
        recovery: { query: 'FROM logs-* | WHERE status == "ok"' },
        no_data: { query: 'FROM logs-* | STATS c = COUNT(*)' },
      },
    };
    const formValues = mapRuleToComposeFormValues(rule);
    const request = composeFormToCreateRequest(formValues);
    expect(request.query).toEqual({
      format: 'standalone',
      breach: { query: 'FROM logs-* | WHERE status == "error"' },
      recovery: { query: 'FROM logs-* | WHERE status == "ok"' },
      no_data: { query: 'FROM logs-* | STATS c = COUNT(*)' },
    });
    expect(request.recovery_strategy).toBe('query');
    expect(request.no_data_strategy).toBe('emit');
  });

  it('does not emit recovery_strategy when not set and no recovery block', () => {
    const formValues = mapRuleToComposeFormValues(baseRuleResponse);
    const request = composeFormToCreateRequest(formValues);
    expect(request.recovery_strategy).toBeUndefined();
  });

  it('infers recovery_strategy: query when recovery block present and no explicit strategy', () => {
    const rule: RuleResponse = {
      ...baseRuleResponse,
      recovery_strategy: 'query',
      query: {
        format: 'composed',
        base: BASE,
        breach: { segment: ALERT_SEGMENT },
        recovery: { segment: RECOVERY_SEGMENT },
      },
    };
    const formValues = mapRuleToComposeFormValues(rule);
    const request = composeFormToCreateRequest(formValues);
    expect(request.recovery_strategy).toBe('query');
  });
});

describe('mapYamlFormValuesToComposeFormValues', () => {
  const parsedYaml: FormValues = {
    kind: 'alert',
    metadata: { name: 'Test', enabled: true, description: '', tags: [] },
    timeField: '@timestamp',
    schedule: { every: '1m', lookback: '5m' },
    query: {
      format: 'composed',
      base: BASE,
      breach: { segment: `| ${ALERT_SEGMENT}` },
    },
    stateTransitionAlertDelayMode: 'immediate',
    stateTransitionRecoveryDelayMode: 'immediate',
    artifacts: [],
  };

  it('passes through composed alert queries', () => {
    const result = mapYamlFormValuesToComposeFormValues(parsedYaml);

    expect(result.query).toEqual(parsedYaml.query);
  });

  it('passes through standalone signal queries', () => {
    const signalQuery = {
      format: 'standalone' as const,
      breach: { query: 'FROM logs-* | LIMIT 10' },
    };
    const result = mapYamlFormValuesToComposeFormValues({
      ...parsedYaml,
      kind: 'signal',
      query: signalQuery,
    });

    expect(result.query).toEqual(signalQuery);
  });
});

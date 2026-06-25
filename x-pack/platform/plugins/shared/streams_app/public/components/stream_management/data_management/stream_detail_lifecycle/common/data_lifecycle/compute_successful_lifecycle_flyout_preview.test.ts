/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { computeSuccessfulLifecycleFlyoutPreview } from './compute_successful_lifecycle_flyout_preview';

describe('computeSuccessfulLifecycleFlyoutPreview', () => {
  const ilmPhases = {
    hot: { color: '#000', description: 'hot' },
    delete: { color: '#000', description: 'delete' },
  };

  const ilmSerializedPolicy = {
    name: 'my-policy',
    phases: {
      hot: { min_age: '0d', actions: {} },
      delete: { min_age: '30d', actions: {} },
    },
  };

  const buildArgs = (
    overrides: Partial<Parameters<typeof computeSuccessfulLifecycleFlyoutPreview>[0]>
  ): Parameters<typeof computeSuccessfulLifecycleFlyoutPreview>[0] => ({
    inheritLifecycle: false,
    inheritedEffectiveLifecycle: null,
    method: 'dlm',
    selectedIlmPolicyName: undefined,
    inspectedIlmPolicyName: null,
    selectedIlmPolicyNameAtInspect: undefined,
    ilmPolicies: [],
    effectiveLifecycle: { dsl: {} },
    indexMode: 'standard',
    isServerless: false,
    ilmPhases,
    hotColor: '#000',
    stats: undefined,
    ...overrides,
  });

  it('clears when inheriting but inherited lifecycle is not resolved', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({ inheritLifecycle: true, inheritedEffectiveLifecycle: null })
    );
    expect(preview).toEqual({ action: 'clear' });
  });

  it('clears when inheriting an ILM policy without policy details (r3437008869)', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        inheritLifecycle: true,
        inheritedEffectiveLifecycle: { ilm: { policy: 'my-policy' } },
        ilmPolicies: [],
      })
    );
    expect(preview).toEqual({ action: 'clear' });
  });

  it('applies preview when inheriting an ILM policy with policy details', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        inheritLifecycle: true,
        inheritedEffectiveLifecycle: { ilm: { policy: 'my-policy' } },
        ilmPolicies: [
          {
            name: 'my-policy',
            phases: ilmSerializedPolicy.phases,
            serializedPolicy: ilmSerializedPolicy,
          },
        ],
      })
    );

    expect(preview.action).toBe('apply');
    if (preview.action === 'apply') {
      expect(preview.retentionPeriod).toBe('30d');
    }
  });

  it('applies preview when inheriting a DSL lifecycle', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        inheritLifecycle: true,
        inheritedEffectiveLifecycle: { dsl: { data_retention: '10d' } },
      })
    );

    expect(preview.action).toBe('apply');
    if (preview.action === 'apply') {
      expect(preview.retentionPeriod).toBe('10d');
    }
  });

  it('clears when ILM is selected but selected policy details are missing', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        method: 'ilm',
        selectedIlmPolicyName: 'my-policy',
        ilmPolicies: [],
      })
    );

    expect(preview).toEqual({ action: 'clear' });
  });

  it('applies ILM preview when a selected policy has details', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        method: 'ilm',
        selectedIlmPolicyName: 'my-policy',
        ilmPolicies: [
          {
            name: 'my-policy',
            phases: ilmSerializedPolicy.phases,
            serializedPolicy: ilmSerializedPolicy,
          },
        ],
      })
    );

    expect(preview.action).toBe('apply');
    if (preview.action === 'apply') {
      expect(preview.retentionPeriod).toBe('30d');
    }
  });

  it('uses inspected policy preview and suppresses unsaved changes when inspecting', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        method: 'ilm',
        selectedIlmPolicyName: 'my-policy',
        inspectedIlmPolicyName: 'my-policy',
        selectedIlmPolicyNameAtInspect: 'my-policy',
        ilmPolicies: [
          {
            name: 'my-policy',
            phases: ilmSerializedPolicy.phases,
            serializedPolicy: ilmSerializedPolicy,
          },
        ],
      })
    );

    expect(preview.action).toBe('apply');
    if (preview.action === 'apply') {
      expect(preview.suppressUnsavedChanges).toBe(true);
    }
  });

  it('falls back to DLM preview when method is dlm', () => {
    const preview = computeSuccessfulLifecycleFlyoutPreview(
      buildArgs({
        method: 'dlm',
        effectiveLifecycle: {
          dsl: { data_retention: '5d', downsample: [{ after: '1d', fixed_interval: '1h' }] },
        },
        indexMode: 'time_series',
      })
    );

    expect(preview.action).toBe('apply');
    if (preview.action === 'apply') {
      expect(preview.retentionPeriod).toBe('5d');
      expect(preview.downsampleStepsCount).toBe(1);
    }
  });
});

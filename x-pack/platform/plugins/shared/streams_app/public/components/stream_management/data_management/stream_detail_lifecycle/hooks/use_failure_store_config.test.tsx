/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { EffectiveFailureStore, Streams } from '@kbn/streams-schema';
import { useFailureStoreConfig, transformFailureStoreConfig } from './use_failure_store_config';

jest.mock('./use_failure_store_default_retention', () => ({
  useFailureStoreDefaultRetention: jest.fn(() => ({ value: undefined })),
}));

const createBaseDefinition = (name: string) => ({
  stream: {
    name,
    description: '',
    updated_at: new Date().toISOString(),
    ingest: {
      lifecycle: { inherit: {} },
      processing: { steps: [], updated_at: new Date().toISOString() },
      settings: {},
      failure_store: { inherit: {} },
    },
  },
});

const createClassicDefinition = (
  name: string,
  failureStoreConfig: EffectiveFailureStore
): Streams.ClassicStream.GetResponse => ({
  ...createBaseDefinition(name),
  stream: {
    ...createBaseDefinition(name).stream!,
    type: 'classic',
    ingest: {
      ...createBaseDefinition(name).stream!.ingest,
      classic: {},
    },
  },
  privileges: {
    lifecycle: true,
    manage: true,
    monitor: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    view_index_metadata: true,
    create_snapshot_repository: true,
  },
  effective_lifecycle: { dsl: {} },
  effective_settings: {},
  effective_failure_store: failureStoreConfig,
  data_stream_exists: true,
  dashboards: [],
  rules: [],
});

const createWiredDefinition = (
  name: string,
  failureStoreConfig: EffectiveFailureStore,
  isRoot: boolean = false
): Streams.WiredStream.GetResponse => ({
  ...createBaseDefinition(name),
  stream: {
    ...createBaseDefinition(name).stream!,
    type: 'wired',
    ingest: {
      ...createBaseDefinition(name).stream!.ingest,
      wired: {
        fields: {},
        routing: [],
      },
    },
  },
  privileges: {
    lifecycle: true,
    manage: true,
    monitor: true,
    simulate: true,
    text_structure: true,
    read_failure_store: true,
    manage_failure_store: true,
    view_index_metadata: true,
    create_snapshot_repository: true,
  },
  effective_lifecycle: {
    dsl: {},
    from: isRoot ? name : 'logs',
  },
  effective_failure_store: {
    ...failureStoreConfig,
    from: isRoot ? name : 'logs',
  },
  effective_settings: {},
  data_stream_exists: true,
  inherited_fields: {},
  dashboards: [],
  rules: [],
});

describe('useFailureStoreConfig', () => {
  describe('Classic Stream', () => {
    it('should return config for enabled failure store with custom retention', () => {
      const definition = createClassicDefinition('logs-test', {
        lifecycle: {
          enabled: {
            data_retention: '7d',
            is_default_retention: false,
          },
        },
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: true,
        customRetentionPeriod: '7d',
        defaultRetentionPeriod: undefined,
        retentionDisabled: false,
        inheritOptions: {
          canShowInherit: true,
          isWired: false,
          isCurrentlyInherited: true,
        },
      });
    });

    it('should return config for enabled failure store without custom retention', () => {
      const definition = createClassicDefinition('logs-test', {
        lifecycle: {
          enabled: { is_default_retention: true },
        },
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: true,
        customRetentionPeriod: undefined,
        defaultRetentionPeriod: undefined,
        retentionDisabled: false,
        inheritOptions: {
          canShowInherit: true,
          isWired: false,
          isCurrentlyInherited: true,
        },
      });
    });

    it('should return config for disabled failure store', () => {
      const definition = createClassicDefinition('logs-test', {
        disabled: {},
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: false,
        customRetentionPeriod: undefined,
        defaultRetentionPeriod: undefined,
        retentionDisabled: false,
        inheritOptions: {
          canShowInherit: true,
          isWired: false,
          isCurrentlyInherited: true,
        },
      });
    });

    it('should return config for disabled lifecycle', () => {
      const definition = createClassicDefinition('logs-test', {
        lifecycle: {
          disabled: {},
        },
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: true,
        customRetentionPeriod: undefined,
        defaultRetentionPeriod: undefined,
        retentionDisabled: true,
        inheritOptions: {
          canShowInherit: true,
          isWired: false,
          isCurrentlyInherited: true,
        },
      });
    });

    it('should detect when not inheriting (explicit failure store config)', () => {
      const definition = createClassicDefinition('logs-test', {
        lifecycle: {
          enabled: {
            data_retention: '14d',
            is_default_retention: false,
          },
        },
      });
      definition.stream.ingest.failure_store = {
        lifecycle: { enabled: { data_retention: '14d' } },
      };

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current.inheritOptions.isCurrentlyInherited).toBe(false);
    });

    it('should use cluster default retention when stream has no default retention', () => {
      const { useFailureStoreDefaultRetention } = jest.requireMock(
        './use_failure_store_default_retention'
      );
      useFailureStoreDefaultRetention.mockReturnValueOnce({
        clusterDefaultRetention: '90d',
      });

      const definition = createClassicDefinition('logs-test', {
        lifecycle: {
          enabled: {
            data_retention: '30d',
            is_default_retention: false,
          },
        },
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: true,
        customRetentionPeriod: '30d',
        defaultRetentionPeriod: '90d',
        retentionDisabled: false,
        inheritOptions: {
          canShowInherit: true,
          isWired: false,
          isCurrentlyInherited: true,
        },
      });
    });
  });

  describe('Wired Stream (child)', () => {
    it('should return config for enabled failure store with custom retention', () => {
      const definition = createWiredDefinition('logs.otel.nginx', {
        lifecycle: {
          enabled: {
            data_retention: '5d',
            is_default_retention: false,
          },
        },
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: true,
        customRetentionPeriod: '5d',
        defaultRetentionPeriod: undefined,
        retentionDisabled: false,
        inheritOptions: {
          canShowInherit: true,
          isWired: true,
          isCurrentlyInherited: true,
        },
      });
    });

    it('should return config when inheriting from parent', () => {
      const definition = createWiredDefinition('logs.otel.nginx', {
        lifecycle: {
          enabled: {
            data_retention: '30d',
            is_default_retention: true,
          },
        },
      });

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current.inheritOptions.isCurrentlyInherited).toBe(true);
      expect(result.current.inheritOptions.canShowInherit).toBe(true);
    });

    it('should detect when overriding parent', () => {
      const definition = createWiredDefinition('logs.otel.nginx', {
        lifecycle: {
          enabled: {
            data_retention: '10d',
            is_default_retention: false,
          },
        },
      });
      definition.stream.ingest.failure_store = {
        lifecycle: { enabled: { data_retention: '10d' } },
      };

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current.inheritOptions.isCurrentlyInherited).toBe(false);
      expect(result.current.customRetentionPeriod).toBe('10d');
    });
  });

  describe('Wired Stream (root)', () => {
    it('should return config for root stream (logs)', () => {
      const definition = createWiredDefinition(
        'logs',
        {
          lifecycle: {
            enabled: {
              data_retention: '30d',
              is_default_retention: true,
            },
          },
        },
        true
      );
      // For root streams, failure_store should not be inherited
      definition.stream.ingest.failure_store = {
        lifecycle: { enabled: { data_retention: '30d' } },
      };

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current).toEqual({
        failureStoreEnabled: true,
        customRetentionPeriod: undefined,
        defaultRetentionPeriod: '30d',
        retentionDisabled: false,
        inheritOptions: {
          canShowInherit: false,
          isWired: true,
          isCurrentlyInherited: false,
        },
      });
    });

    it('should return config for root stream (metrics)', () => {
      const definition = createWiredDefinition(
        'metrics',
        {
          lifecycle: {
            enabled: {
              data_retention: '60d',
              is_default_retention: false,
            },
          },
        },
        true
      );
      definition.stream.ingest.failure_store = {
        lifecycle: { enabled: { data_retention: '60d' } },
      };

      const { result } = renderHook(() => useFailureStoreConfig(definition));

      expect(result.current.inheritOptions.canShowInherit).toBe(false);
      expect(result.current.customRetentionPeriod).toBe('60d');
    });
  });
});

describe('transformFailureStoreConfig', () => {
  it('should transform to inherit config', () => {
    const result = transformFailureStoreConfig({
      inherit: true,
      failureStoreEnabled: true,
    });

    expect(result).toEqual({ inherit: {} });
  });

  it('should transform to disabled config when failureStore is disabled', () => {
    const result = transformFailureStoreConfig({
      failureStoreEnabled: false,
    });

    expect(result).toEqual({ disabled: {} });
  });

  it('should transform to disabled lifecycle config', () => {
    const result = transformFailureStoreConfig({
      failureStoreEnabled: true,
      retentionDisabled: true,
    });

    expect(result).toEqual({ lifecycle: { disabled: {} } });
  });

  it('should transform to enabled config without custom retention', () => {
    const result = transformFailureStoreConfig({
      failureStoreEnabled: true,
    });

    expect(result).toEqual({
      lifecycle: { enabled: {} },
    });
  });

  it('should transform to enabled config with custom retention', () => {
    const result = transformFailureStoreConfig({
      failureStoreEnabled: true,
      customRetentionPeriod: '15d',
    });

    expect(result).toEqual({
      lifecycle: { enabled: { data_retention: '15d' } },
    });
  });

  it('should prioritize inherit over other settings', () => {
    const result = transformFailureStoreConfig({
      inherit: true,
      failureStoreEnabled: true,
      customRetentionPeriod: '15d',
    });

    expect(result).toEqual({ inherit: {} });
  });
});

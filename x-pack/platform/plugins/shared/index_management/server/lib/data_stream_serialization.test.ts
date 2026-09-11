/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EnhancedDataStreamFromEs } from '../../common';
import { deserializeDataStream } from './data_stream_serialization';
import {
  LOGSDB_INDEX_MODE,
  LOOKUP_INDEX_MODE,
  STANDARD_INDEX_MODE,
  TIME_SERIES_MODE,
  VECTOR_DB_INDEX_MODE,
} from '../../common/constants';

describe('deserializeDataStream', () => {
  const mockDataStreamFromEs: EnhancedDataStreamFromEs = {
    name: 'test-data-stream',
    timestamp_field: {
      name: '@timestamp',
    },
    indices: [
      {
        index_name: '.ds-test-data-stream-000001',
        index_uuid: 'uuid-1',
        prefer_ilm: true,
        managed_by: 'Data stream lifecycle',
      },
      {
        index_name: '.ds-test-data-stream-000002',
        index_uuid: 'uuid-2',
        prefer_ilm: false,
        managed_by: 'Index Lifecycle Management',
      },
    ],
    generation: 2,
    status: 'GREEN',
    template: 'test-template',
    ilm_policy: 'test-ilm-policy',
    store_size: '10mb',
    store_size_bytes: 10485760,
    maximum_timestamp: 1640995200000,
    metering_size_in_bytes: 5242880,
    metering_doc_count: 1000,
    _meta: { description: 'Test data stream' },
    privileges: {
      delete_index: true,
      manage_data_stream_lifecycle: true,
      read_failure_store: true,
      manage: true,
    },
    hidden: false,
    lifecycle: {
      data_retention: '7d',
      enabled: true,
    },
    global_max_retention: '30d',
    next_generation_managed_by: 'Data stream lifecycle',
    index_mode: 'standard' as const,
    failure_store: {
      enabled: true,
      lifecycle: {
        enabled: true,
        data_retention: '7d',
        retention_determined_by: 'data_stream_configuration',
      },
      indices: [],
      rollover_on_write: false,
    } as any,
    prefer_ilm: true,
    rollover_on_write: true,
    settings: {},
  };

  describe('basic deserialization', () => {
    it('should deserialize data stream with all fields', () => {
      const result = deserializeDataStream(mockDataStreamFromEs, false, undefined, {
        failureStore: {
          enabled: true,
          lifecycle: { enabled: true, data_retention: '7d' },
        },
      });

      expect(result).toEqual({
        name: 'test-data-stream',
        timeStampField: { name: '@timestamp' },
        indices: [
          {
            name: '.ds-test-data-stream-000001',
            uuid: 'uuid-1',
            preferILM: true,
            managedBy: 'Data stream lifecycle',
          },
          {
            name: '.ds-test-data-stream-000002',
            uuid: 'uuid-2',
            preferILM: false,
            managedBy: 'Index Lifecycle Management',
          },
        ],
        generation: 2,
        health: 'green',
        indexTemplateName: 'test-template',
        ilmPolicyName: 'test-ilm-policy',
        storageSize: '10mb',
        storageSizeBytes: 10485760,
        maxTimeStamp: 1640995200000,
        meteringStorageSize: '5mb',
        meteringStorageSizeBytes: 5242880,
        meteringDocsCount: 1000,
        _meta: { description: 'Test data stream' },
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
        hidden: false,
        lifecycle: {
          data_retention: '7d',
          enabled: true,
          globalMaxRetention: '30d',
        },
        nextGenerationManagedBy: 'Data stream lifecycle',
        matchesFailureStoreClusterPattern: false,
        failureStoreSettings: {
          enabled: true,
          lifecycle: {
            enabled: true,
            dataRetention: '7d',
          },
        },
        failureStoreEnabled: true,
        failureStoreRetention: {
          customRetentionPeriod: '7d',
          defaultRetentionPeriod: undefined,
          retentionDisabled: false,
          retentionDeterminedBy: 'data_stream_configuration',
        },
        indexMode: 'standard',
      });
    });

    it('should handle missing optional fields', () => {
      const minimalDataStream: EnhancedDataStreamFromEs = {
        name: 'minimal-stream',
        timestamp_field: {
          name: '@timestamp',
        },
        indices: [
          {
            index_name: '.ds-minimal-stream-000001',
            index_uuid: 'uuid-1',
          },
        ],
        generation: 1,
        status: 'YELLOW',
        template: 'minimal-template',
        privileges: {
          delete_index: true,
          manage_data_stream_lifecycle: true,
          read_failure_store: true,
          manage: true,
        },
        prefer_ilm: true,
        rollover_on_write: true,
        settings: {},
        hidden: false,
        next_generation_managed_by: 'Data stream lifecycle',
      };

      const result = deserializeDataStream(minimalDataStream, false);

      expect(result).toMatchObject({
        name: 'minimal-stream',
        timeStampField: { name: '@timestamp' },
        indices: [
          {
            name: '.ds-minimal-stream-000001',
            uuid: 'uuid-1',
            preferILM: false,
            managedBy: undefined,
          },
        ],
        generation: 1,
        health: 'yellow',
        indexTemplateName: 'minimal-template',
        failureStoreEnabled: false,
        failureStoreRetention: {
          customRetentionPeriod: undefined,
          defaultRetentionPeriod: undefined,
        },
        indexMode: 'standard',
      });
    });

    it('populates lifecycleSettings only from explicit options', () => {
      const result = deserializeDataStream(mockDataStreamFromEs, false, undefined, {
        lifecycleSettings: { preferIlm: false },
      });

      expect(result.lifecycleSettings).toEqual({ preferIlm: false });
    });
  });

  describe('failure store configuration', () => {
    it('should enable failure store when explicitly enabled in data stream config', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        failure_store: {
          enabled: true,
          indices: [],
          rollover_on_write: false,
        },
      };

      const result = deserializeDataStream(dataStream, false);

      expect(result.failureStoreEnabled).toBe(true);
    });

    it('should disable failure store when explicitly disabled in data stream config', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        failure_store: {
          enabled: false,
          indices: [],
          rollover_on_write: false,
        },
      };

      const result = deserializeDataStream(dataStream, false);

      expect(result.failureStoreEnabled).toBe(false);
    });

    it('should enable failure store when data stream matches cluster setting pattern', () => {
      const failureStoreSettings = {
        enabled: ['test-*', 'logs-*'],
        defaultRetentionPeriod: '30d',
      };

      const result = deserializeDataStream(mockDataStreamFromEs, false, failureStoreSettings);

      expect(result.failureStoreEnabled).toBe(true);
      expect(result.failureStoreRetention).toBeDefined();
      expect(result.failureStoreRetention!.defaultRetentionPeriod).toBe('30d');
    });

    it('should not enable failure store when data stream does not match cluster setting pattern', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        name: 'other-data-stream',
        failure_store: undefined,
      };
      const failureStoreSettings = {
        enabled: ['test-*', 'logs-*'],
      };

      const result = deserializeDataStream(dataStream, false, failureStoreSettings);

      expect(result.failureStoreEnabled).toBe(false);
    });

    it('should handle single pattern string in cluster settings', () => {
      const failureStoreSettings = {
        enabled: 'test-*',
      };

      const result = deserializeDataStream(mockDataStreamFromEs, false, failureStoreSettings);

      expect(result.failureStoreEnabled).toBe(true);
    });

    it('treats enabled="true" as match-all', () => {
      const failureStoreSettings = {
        enabled: 'true',
      };

      const result = deserializeDataStream(
        { ...mockDataStreamFromEs, name: 'any-data-stream', failure_store: undefined },
        false,
        failureStoreSettings
      );

      expect(result.failureStoreEnabled).toBe(true);
      expect(result.matchesFailureStoreClusterPattern).toBe(true);
    });

    it('should disable failure store when matches pattern but explicitly disabled', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        failure_store: {
          enabled: false,
          indices: [],
          rollover_on_write: false,
        },
      };
      const failureStoreSettings = {
        enabled: ['test-*'],
      };

      const result = deserializeDataStream(dataStream, false, failureStoreSettings);

      expect(result.failureStoreEnabled).toBe(false);
    });

    it('should extract custom retention period from failure store config', () => {
      const dataStreamWithLifecycle = {
        ...mockDataStreamFromEs,
        failure_store: {
          enabled: true,
          indices: [],
          rollover_on_write: false,
          lifecycle: {
            enabled: true,
            data_retention: '21d',
          },
        } as any,
      };

      const result = deserializeDataStream(dataStreamWithLifecycle, false);

      expect(result.failureStoreRetention).toBeDefined();
      expect(result.failureStoreRetention!.customRetentionPeriod).toBe('21d');
    });

    it('should extract disabled retention period from failure store config', () => {
      const dataStreamWithLifecycle = {
        ...mockDataStreamFromEs,
        failure_store: {
          enabled: true,
          indices: [],
          rollover_on_write: false,
          lifecycle: {
            enabled: false,
          },
        } as any,
      };

      const result = deserializeDataStream(dataStreamWithLifecycle, false);

      expect(result.failureStoreRetention).toBeDefined();
      expect(result.failureStoreRetention!.retentionDisabled).toBe(true);
    });
  });

  describe('index mode detection', () => {
    it('should use provided index mode when available', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        index_mode: 'logsdb' as const,
      };

      const result = deserializeDataStream(dataStream, false);

      expect(result.indexMode).toBe('logsdb');
    });

    it.each([TIME_SERIES_MODE, LOOKUP_INDEX_MODE, VECTOR_DB_INDEX_MODE])(
      'should use provided %s index mode instead of falling back to standard',
      (indexMode) => {
        const dataStream = {
          ...mockDataStreamFromEs,
          index_mode: indexMode,
        } as EnhancedDataStreamFromEs;

        const result = deserializeDataStream(dataStream, false);

        expect(result.indexMode).toBe(indexMode);
      }
    );

    it('should keep provided time_series index mode when logsdb is enabled and name matches logs pattern', () => {
      const dataStream: EnhancedDataStreamFromEs = {
        ...mockDataStreamFromEs,
        name: 'logs-nginx-production',
        index_mode: TIME_SERIES_MODE,
      };

      const result = deserializeDataStream(dataStream, true);

      expect(result.indexMode).toBe(TIME_SERIES_MODE);
    });

    it('should keep provided standard index mode when logsdb is enabled and name matches logs pattern', () => {
      const dataStream: EnhancedDataStreamFromEs = {
        ...mockDataStreamFromEs,
        name: 'logs-nginx-production',
        index_mode: STANDARD_INDEX_MODE,
      };

      const result = deserializeDataStream(dataStream, true);

      expect(result.indexMode).toBe(STANDARD_INDEX_MODE);
    });

    it('should default to standard mode when the provided index mode is unknown', () => {
      const unknownIndexMode: string = 'unknown_mode';
      const dataStream = {
        ...mockDataStreamFromEs,
        index_mode: unknownIndexMode,
      } as EnhancedDataStreamFromEs;

      const result = deserializeDataStream(dataStream, false);

      expect(result.indexMode).toBe(STANDARD_INDEX_MODE);
    });

    it('should default to logsdb mode for logs pattern when logsdb is enabled and the provided index mode is unknown', () => {
      const unknownIndexMode: string = 'unknown_mode';
      const dataStream = {
        ...mockDataStreamFromEs,
        name: 'logs-nginx-production',
        index_mode: unknownIndexMode,
      } as EnhancedDataStreamFromEs;

      const result = deserializeDataStream(dataStream, true);

      expect(result.indexMode).toBe(LOGSDB_INDEX_MODE);
    });

    it('should default to logsdb mode for logs pattern when logsdb is enabled and no index mode provided', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        name: 'logs-nginx-production',
        index_mode: undefined,
      };

      const result = deserializeDataStream(dataStream, true);

      expect(result.indexMode).toBe(LOGSDB_INDEX_MODE);
    });

    it('should default to standard mode when logsdb is enabled but name does not match logs pattern', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        name: 'metrics-system-production',
        index_mode: undefined,
      };

      const result = deserializeDataStream(dataStream, true);

      expect(result.indexMode).toBe(STANDARD_INDEX_MODE);
    });

    it('should default to standard mode when logsdb is disabled', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        name: 'logs-nginx-production',
        index_mode: undefined,
      };

      const result = deserializeDataStream(dataStream, false);

      expect(result.indexMode).toBe(STANDARD_INDEX_MODE);
    });
  });

  describe('health status conversion', () => {
    it('should convert status to lowercase', () => {
      const testCases = [
        { status: 'GREEN', expected: 'green' },
        { status: 'YELLOW', expected: 'yellow' },
        { status: 'RED', expected: 'red' },
      ];

      testCases.forEach(({ status, expected }) => {
        const dataStream = {
          ...mockDataStreamFromEs,
          status: status as any,
        };

        const result = deserializeDataStream(dataStream, false);

        expect(result.health).toBe(expected);
      });
    });
  });

  describe('metering storage size calculation', () => {
    it('should convert metering size bytes to human readable format', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        metering_size_in_bytes: 1073741824, // 1GB
      };

      const result = deserializeDataStream(dataStream, false);

      expect(result.meteringStorageSize).toBe('1gb');
    });

    it('should handle undefined metering size', () => {
      const dataStream = {
        ...mockDataStreamFromEs,
        metering_size_in_bytes: undefined,
      };

      const result = deserializeDataStream(dataStream, false);

      expect(result.meteringStorageSize).toBeUndefined();
    });
  });

  describe('pattern matching for failure store', () => {
    it('should match complex wildcard patterns', () => {
      const testCases = [
        { pattern: 'logs-*', name: 'logs-nginx-prod', shouldMatch: true },
        { pattern: 'logs-*-*', name: 'logs-nginx-prod', shouldMatch: true },
        { pattern: 'metrics-*', name: 'logs-nginx-prod', shouldMatch: false },
        { pattern: '*-production', name: 'logs-nginx-production', shouldMatch: true },
        { pattern: 'test-*-stream', name: 'test-data-stream', shouldMatch: true },
      ];

      testCases.forEach(({ pattern, name, shouldMatch }) => {
        const dataStream = {
          ...mockDataStreamFromEs,
          name,
          failure_store: undefined,
        };
        const failureStoreSettings = { enabled: [pattern] };

        const result = deserializeDataStream(dataStream, false, failureStoreSettings);

        expect(result.failureStoreEnabled).toBe(shouldMatch);
      });
    });
  });
});

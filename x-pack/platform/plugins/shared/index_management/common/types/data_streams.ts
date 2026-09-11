/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ByteSize,
  IndicesDataStream,
  IndicesDataStreamsStatsDataStreamsStatsItem,
  HealthStatus,
  Metadata,
  IndicesDataStreamIndex,
  IndicesDataStreamLifecycleWithRollover,
  IndicesFailureStore,
} from '@elastic/elasticsearch/lib/api/types';
import type { IndexMode } from '../constants/index_modes';

interface TimestampFieldFromEs {
  name: string;
}

type TimestampField = TimestampFieldFromEs;

interface PrivilegesFromEs {
  delete_index: boolean;
  manage_data_stream_lifecycle: boolean;
  read_failure_store: boolean;
  manage: boolean;
}

type Privileges = PrivilegesFromEs;

export type HealthFromEs = 'GREEN' | 'YELLOW' | 'RED';

export type DataStreamIndexFromEs = IndicesDataStreamIndex;

export type Health = Lowercase<HealthStatus>;

export type IndexMode = (typeof IndexMode)[keyof typeof IndexMode];

/**
 * Elasticsearch retention duration: either a duration string (e.g. `'7d'`) or `-1`, the sentinel
 * Elasticsearch uses for "keep data indefinitely" (infinite retention).
 */
export type EsDataRetention = string | -1;

export interface EnhancedDataStreamFromEs extends IndicesDataStream {
  global_max_retention?: string;
  store_size?: IndicesDataStreamsStatsDataStreamsStatsItem['store_size'];
  store_size_bytes?: IndicesDataStreamsStatsDataStreamsStatsItem['store_size_bytes'];
  maximum_timestamp?: IndicesDataStreamsStatsDataStreamsStatsItem['maximum_timestamp'];
  metering_size_in_bytes?: number;
  metering_doc_count?: number;
  indices: DataStreamIndexFromEs[];
  privileges: {
    delete_index: boolean;
    manage_data_stream_lifecycle: boolean;
    read_failure_store: boolean;
    manage: boolean;
  };
  // Override failure_store to support lifecycle property
  failure_store?: IndicesFailureStore & {
    lifecycle?: {
      enabled?: boolean;
      data_retention?: EsDataRetention;
      retention_determined_by?: 'default_failures_retention' | 'data_stream_configuration';
      effective_retention?: string;
    };
  };
}

export interface DataStream {
  name: string;
  timeStampField: TimestampField;
  indices: DataStreamIndex[];
  generation: number;
  health: Health;
  indexTemplateName: string;
  ilmPolicyName?: string;
  lifecycleSettings?: {
    explicitIlmPolicyName?: string;
    preferIlm?: boolean;
  };
  storageSize?: ByteSize;
  storageSizeBytes?: number;
  maxTimeStamp?: number;
  meteringStorageSizeBytes?: number;
  meteringStorageSize?: string;
  meteringDocsCount?: number;
  _meta?: Metadata;
  privileges: Privileges;
  hidden: boolean;
  nextGenerationManagedBy: string;
  failureStoreSettings?: {
    enabled?: boolean;
    lifecycle?: {
      enabled?: boolean;
      dataRetention?: EsDataRetention;
    };
  };
  matchesFailureStoreClusterPattern?: boolean;
  failureStoreEnabled?: boolean;
  failureStoreRetention?: {
    customRetentionPeriod?: EsDataRetention;
    defaultRetentionPeriod?: string;
    retentionDisabled?: boolean;
    retentionDeterminedBy?: 'default_failures_retention' | 'data_stream_configuration';
  };
  lifecycle?: IndicesDataStreamLifecycleWithRollover & {
    globalMaxRetention?: string;
  };
  indexMode: IndexMode;
}

export interface DataStreamIndex {
  name: string;
  uuid: string;
  preferILM: boolean;
  managedBy?: string;
  ilmPolicyName?: string;
  indexMode?: string;
}

export interface DataRetention {
  enabled: boolean;
  infiniteDataRetention?: boolean;
  value?: number;
  unit?: string;
  frozen?: {
    enabled: boolean;
    value?: number;
    unit?: string;
  };
}

export interface DataStreamOptions {
  failure_store?: {
    enabled: boolean;
    lifecycle?: {
      enabled?: boolean;
      data_retention?: string | -1;
    };
  };
  [key: string]: unknown;
}

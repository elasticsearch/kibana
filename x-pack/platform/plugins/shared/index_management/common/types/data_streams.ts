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
}

type Privileges = PrivilegesFromEs;

export type HealthFromEs = 'GREEN' | 'YELLOW' | 'RED';

export type DataStreamIndexFromEs = IndicesDataStreamIndex;

export type Health = Lowercase<HealthStatus>;

export type IndexMode = (typeof IndexMode)[keyof typeof IndexMode];

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
  };
  // Override failure_store to support lifecycle property
  // Note: We narrow data_retention to string only,
  // as the native es numeric Duration type values (-1, 0)
  // from IndicesFailureStoreLifecycle['data_retention']
  // are not used for data retention in our implementation.
  failure_store?: IndicesFailureStore & {
    lifecycle?: {
      enabled?: boolean;
      data_retention?: string;
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
  failureStoreEnabled?: boolean;
  failureStoreRetention?: {
    customRetentionPeriod?: string;
    defaultRetentionPeriod?: string;
    retentionDisabled?: boolean;
  };
  lifecycle?: IndicesDataStreamLifecycleWithRollover & {
    enabled?: boolean;
    effective_retention?: string;
    retention_determined_by?: string;
    globalMaxRetention?: string;
  };
  indexMode: IndexMode;
}

export interface DataStreamIndex {
  name: string;
  uuid: string;
  preferILM: boolean;
  managedBy?: string;
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
  };
  [key: string]: unknown;
}

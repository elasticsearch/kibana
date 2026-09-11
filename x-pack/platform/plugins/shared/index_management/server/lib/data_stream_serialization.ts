/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ByteSizeValue } from '@kbn/config-schema';
import {
  IndexMode as IndexModeValues,
  LOGSDB_INDEX_MODE,
  STANDARD_INDEX_MODE,
} from '../../common/constants';
import type { IndexMode } from '../../common/types/data_streams';
import type { DataStream, EnhancedDataStreamFromEs, EsDataRetention, Health } from '../../common';

const KNOWN_INDEX_MODES = new Set<string>(Object.values(IndexModeValues));

const isKnownIndexMode = (value?: string): value is IndexMode =>
  value !== undefined && KNOWN_INDEX_MODES.has(value);

const toLowercaseHealth = (status: EnhancedDataStreamFromEs['status']): Health => {
  switch (status) {
    case 'green':
    case 'GREEN':
      return 'green';
    case 'yellow':
    case 'YELLOW':
      return 'yellow';
    case 'red':
    case 'RED':
      return 'red';
    case 'unknown':
      return 'unknown';
    case 'unavailable':
      return 'unavailable';
  }
};

export function deserializeDataStream(
  dataStreamFromEs: EnhancedDataStreamFromEs,
  isLogsdbEnabled: boolean,
  failureStoreSettings?: { enabled?: string[] | string; defaultRetentionPeriod?: string },
  explicitOptions?: {
    failureStore?: {
      enabled?: boolean;
      lifecycle?: { enabled?: boolean; data_retention?: EsDataRetention };
    };
    lifecycleSettings?: DataStream['lifecycleSettings'];
  }
): DataStream {
  const {
    name,
    timestamp_field: timeStampField,
    indices,
    generation,
    status,
    template,
    ilm_policy: ilmPolicyName,
    store_size: storageSize,
    store_size_bytes: storageSizeBytes,
    maximum_timestamp: maxTimeStamp,
    metering_size_in_bytes: meteringStorageSizeBytes,
    metering_doc_count: meteringDocsCount,
    _meta,
    privileges,
    hidden,
    lifecycle,
    global_max_retention: globalMaxRetention,
    next_generation_managed_by: nextGenerationManagedBy,
    index_mode: indexMode,
    failure_store: failureStore,
  } = dataStreamFromEs;

  // `lifecycleSettings` is used by the UI as an explicit override marker.
  // We only populate it from the "explicit settings" endpoint (`GET .../_settings`), not from the
  // standard data stream GET response, because the latter reflects effective values (template +
  // overrides merged) and cannot reliably distinguish inheritance from explicit overrides.
  const lifecycleSettingsFromEs =
    explicitOptions?.lifecycleSettings && Object.keys(explicitOptions.lifecycleSettings).length > 0
      ? explicitOptions.lifecycleSettings
      : undefined;

  // `failureStoreSettings` represents the data stream's *explicit* override (from the
  // `_options` endpoint), NOT the effective failure store from the data stream GET (which
  // also includes values inherited from the index template). The UI relies on the presence
  // of this object to distinguish "inherited" from "explicit override".
  const failureStoreSettingsFromEs = (() => {
    const explicitFailureStore = explicitOptions?.failureStore;
    if (!explicitFailureStore) return undefined;

    const { enabled, lifecycle: failureLifecycle } = explicitFailureStore;

    const result: DataStream['failureStoreSettings'] = {
      ...(typeof enabled === 'boolean' ? { enabled } : {}),
    };

    if (failureLifecycle) {
      const lifecycleResult: NonNullable<DataStream['failureStoreSettings']>['lifecycle'] = {
        ...(typeof failureLifecycle.enabled === 'boolean'
          ? { enabled: failureLifecycle.enabled }
          : {}),
        ...(failureLifecycle.data_retention !== undefined
          ? { dataRetention: failureLifecycle.data_retention }
          : {}),
      };

      if (lifecycleResult.enabled !== undefined || lifecycleResult.dataRetention !== undefined) {
        result.lifecycle = lifecycleResult;
      }
    }

    return Object.keys(result).length > 0 ? result : undefined;
  })();

  const meteringStorageSize =
    meteringStorageSizeBytes !== undefined
      ? new ByteSizeValue(meteringStorageSizeBytes).toString()
      : undefined;

  // Determine failure store status based on cluster settings and data stream configuration
  let failureStoreEnabled = false;
  let matchesFailureStoreClusterPattern = false;

  const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const wildcardToRegExp = (pattern: string): RegExp => {
    const source = pattern.split('*').map(escapeRegExp).join('.*');
    return new RegExp(`^${source}$`);
  };

  // Check if data stream name matches any pattern in the cluster setting
  if (failureStoreSettings?.enabled) {
    const enabledSetting = failureStoreSettings.enabled;

    if (enabledSetting === 'true') {
      // In some deployments this setting is a boolean-like "true", meaning "enable for all".
      matchesFailureStoreClusterPattern = true;
    } else if (enabledSetting === 'false') {
      matchesFailureStoreClusterPattern = false;
    } else {
      const patterns =
        Array.isArray(enabledSetting) && enabledSetting.every((p) => typeof p === 'string')
          ? enabledSetting
          : typeof enabledSetting === 'string'
          ? [enabledSetting]
          : [];

      matchesFailureStoreClusterPattern = patterns.some((pattern) =>
        wildcardToRegExp(pattern).test(name)
      );
    }

    if (matchesFailureStoreClusterPattern) {
      // If matches pattern, enable unless explicitly disabled
      const isExplicitlyDisabled = failureStore?.enabled === false;
      failureStoreEnabled = !isExplicitlyDisabled;
    }
  }

  // If explicitly enabled in data stream config, always enable
  if (failureStore?.enabled === true) {
    failureStoreEnabled = true;
  }
  const failureStoreLifecycle = failureStore?.lifecycle;

  const resolvedIndexMode: IndexMode = isKnownIndexMode(indexMode)
    ? indexMode
    : isLogsdbEnabled && /^logs-[^-]+-[^-]+$/.test(name)
    ? LOGSDB_INDEX_MODE
    : STANDARD_INDEX_MODE;

  const resolvedFailureStoreDefaultRetentionPeriod =
    failureStoreLifecycle?.retention_determined_by === 'default_failures_retention' &&
    typeof failureStoreLifecycle.effective_retention === 'string'
      ? failureStoreLifecycle.effective_retention
      : failureStoreSettings?.defaultRetentionPeriod;

  return {
    name,
    timeStampField,
    indices: indices.map(
      ({
        index_name: indexName,
        index_uuid: indexUuid,
        prefer_ilm: preferILM = false,
        managed_by: managedBy,
        ilm_policy: backingIndexIlmPolicyName,
        index_mode: backingIndexMode,
      }: {
        index_name: string;
        index_uuid: string;
        prefer_ilm?: boolean;
        managed_by?: string;
        ilm_policy?: string;
        index_mode?: string;
      }) => ({
        name: indexName,
        uuid: indexUuid,
        preferILM,
        managedBy,
        ...(backingIndexIlmPolicyName !== undefined
          ? { ilmPolicyName: backingIndexIlmPolicyName }
          : {}),
        ...(backingIndexMode !== undefined ? { indexMode: backingIndexMode } : {}),
      })
    ),
    generation,
    health: toLowercaseHealth(status),
    indexTemplateName: template,
    ilmPolicyName,
    ...(lifecycleSettingsFromEs ? { lifecycleSettings: lifecycleSettingsFromEs } : {}),
    ...(failureStoreSettingsFromEs ? { failureStoreSettings: failureStoreSettingsFromEs } : {}),
    storageSize,
    storageSizeBytes,
    maxTimeStamp,
    meteringStorageSize,
    meteringStorageSizeBytes,
    meteringDocsCount,
    _meta,
    privileges,
    hidden,
    lifecycle: {
      ...lifecycle,
      globalMaxRetention,
    },
    nextGenerationManagedBy,
    failureStoreEnabled,
    matchesFailureStoreClusterPattern,
    failureStoreRetention: {
      customRetentionPeriod:
        failureStoreLifecycle?.enabled && failureStoreLifecycle?.data_retention
          ? failureStoreLifecycle.data_retention
          : undefined,
      defaultRetentionPeriod: resolvedFailureStoreDefaultRetentionPeriod,
      retentionDisabled: failureStoreLifecycle?.enabled === false,
      retentionDeterminedBy:
        failureStoreLifecycle?.retention_determined_by === 'default_failures_retention' ||
        failureStoreLifecycle?.retention_determined_by === 'data_stream_configuration'
          ? failureStoreLifecycle.retention_determined_by
          : undefined,
    },
    indexMode: resolvedIndexMode,
  };
}

export function deserializeDataStreamList(
  dataStreamsFromEs: EnhancedDataStreamFromEs[],
  isLogsdbEnabled: boolean,
  failureStoreSettings?: { enabled?: string[] | string }
): DataStream[] {
  return dataStreamsFromEs.map((dataStream) =>
    deserializeDataStream(dataStream, isLogsdbEnabled, failureStoreSettings)
  );
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Streams } from '@kbn/streams-schema';
import { isEnabledFailureStore, isRoot } from '@kbn/streams-schema';
import {
  isDisabledLifecycleFailureStore,
  isInheritFailureStore,
} from '@kbn/streams-schema/src/models/ingest/failure_store';
import type { FailureStoreFormData } from '@kbn/failure-store-modal';
import { useKibana } from '../../../../../hooks/use_kibana';
import { useFailureStoreDefaultRetention } from './use_failure_store_default_retention';

export function transformFailureStoreConfig(update: FailureStoreFormData) {
  const failureStoreEnabled = update.failureStoreEnabled ?? false;

  // Inherit
  if ('inherit' in update && update.inherit) {
    return { inherit: {} };
  }

  // Disabled
  if (!failureStoreEnabled) {
    return { disabled: {} };
  }

  // Disabled lifecycle
  if ('retentionDisabled' in update && update.retentionDisabled) {
    return { lifecycle: { disabled: {} } };
  }

  // Enabled
  const customRetentionPeriod =
    'customRetentionPeriod' in update ? update.customRetentionPeriod : undefined;

  return {
    lifecycle: { enabled: { data_retention: customRetentionPeriod } },
  };
}

export function useFailureStoreConfig(definition: Streams.ingest.all.GetResponse) {
  const { isServerless } = useKibana();
  const { effective_failure_store: failureStore } = definition;

  const isWired = Streams.WiredStream.GetResponse.is(definition);
  const isClassicStream = Streams.ClassicStream.GetResponse.is(definition);
  const isRootStream = isRoot(definition.stream.name);

  const failureStoreEnabled = isEnabledFailureStore(failureStore);
  const retentionDisabled = isDisabledLifecycleFailureStore(failureStore);
  const isDefaultRetention =
    failureStoreEnabled &&
    !retentionDisabled &&
    failureStore.lifecycle.enabled.is_default_retention;
  const retentionPeriod =
    failureStoreEnabled && !retentionDisabled
      ? failureStore.lifecycle.enabled.data_retention
      : undefined;
  const isCurrentlyInherited = isInheritFailureStore(definition.stream.ingest.failure_store);
  const canShowInherit = (isWired && !isRootStream) || isClassicStream;

  const { clusterDefaultRetention } = useFailureStoreDefaultRetention(true);

  const defaultRetentionPeriod = isServerless
    ? isDefaultRetention
      ? retentionPeriod
      : clusterDefaultRetention
    : isDefaultRetention
    ? retentionPeriod ?? clusterDefaultRetention
    : undefined;

  return {
    defaultRetentionPeriod,
    clusterDefaultRetention,
    customRetentionPeriod: !isDefaultRetention && retentionPeriod ? retentionPeriod : undefined,
    failureStoreEnabled,
    inheritOptions: {
      canShowInherit,
      isWired,
      isCurrentlyInherited,
    },
    retentionDisabled,
  };
}

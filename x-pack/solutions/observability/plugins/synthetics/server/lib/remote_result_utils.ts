/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isNonLocalIndexName } from '@kbn/es-query';
import type { RemoteMonitorInfo } from '../../common/runtime_types';
import type { SyntheticsServerSetup } from '../types';

// CCS is supported on stateful Kibana but not on Elasticsearch Serverless,
// which doesn't expose remote-cluster wiring.
export const isCCSEnabled = (server: Pick<SyntheticsServerSetup, 'isElasticsearchServerless'>) =>
  !server.isElasticsearchServerless;

/**
 * Extracts the remote cluster name from an ES `_index` field.
 * Returns undefined if the index is local.
 *
 * Example: "cluster1:synthetics-*" → "cluster1"
 */
export function getRemoteClusterName(index: string): string | undefined {
  if (isNonLocalIndexName(index)) {
    return index.substring(0, index.indexOf(':'));
  }
}

/**
 * Builds a RemoteMonitorInfo object for a search hit if it originates from a remote cluster.
 * Returns undefined for local hits.
 *
 * @param index - The `_index` field from the ES search hit
 * @param kibanaUrl - Optional kibanaUrl from the document source, for deep linking
 */
export function getRemoteMonitorInfo(
  index: string,
  kibanaUrl?: string
): RemoteMonitorInfo | undefined {
  const remoteName = getRemoteClusterName(index);
  if (!remoteName) {
    return undefined;
  }

  return {
    remoteName,
    ...(kibanaUrl ? { kibanaUrl } : {}),
  };
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useLoadConnectors } from '@kbn/inference-connectors';
import { useKibana } from '../use_kibana';

export interface UseInferenceFeatureConnectorsResult {
  resolvedConnectorId: string | undefined;
  loading: boolean;
  error: Error | undefined;
}

/**
 * Resolves the connector to use for a given inference feature.
 * Delegates to useLoadConnectors from @kbn/inference-connectors
 * and picks the best connector based on SO overrides vs recommended.
 */
export function useInferenceFeatureConnectors(
  featureId: string
): UseInferenceFeatureConnectorsResult {
  const {
    core: {
      http,
      notifications: { toasts },
    },
  } = useKibana();

  const query = useLoadConnectors({ http, toasts, featureId });
  const connectors = query.data ?? [];

  // When an SO entry exists the API puts the configured connector first.
  // Otherwise the API prepends the global default before the recommended
  // ones, so we skip it and pick the first recommended connector instead.
  const picked = query.soEntryFound
    ? connectors[0]
    : connectors.find((c) => c.isRecommended) ?? connectors[0];

  return {
    resolvedConnectorId: picked?.id,
    loading: query.isLoading || query.isFetching,
    error: query.error ?? undefined,
  };
}

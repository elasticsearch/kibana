/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import type { ExploratoryEmbeddableProps } from '@kbn/exploratory-view-plugin/public';
import { SYNTHETICS_INDEX_PATTERN } from '../../../../../../common/constants';
import { getSyntheticsCcsIndex } from '../../../../../../common/get_synthetics_indices';
import { useSyntheticsSettingsContext } from '../../../contexts';
import {
  DEFAULT_CCS_SETTINGS,
  fetchCCSSettings,
} from '../../settings/remote_clusters/hooks/use_get_ccs_settings';

type DataTypesIndexPatterns = NonNullable<ExploratoryEmbeddableProps['dataTypesIndexPatterns']>;

interface BuildArgs {
  isCCSEnabled: boolean;
  useAllRemoteClusters: boolean;
  selectedRemoteClusters: string[];
}

/**
 * Builds the `synthetics` index pattern for the Overview page Lens embeddables,
 * mirroring the server-side `getSyntheticsIndices` resolution used by
 * `SyntheticsEsClient` so browser-issued Errors queries span the same clusters
 * as the (server-resolved) status grid:
 *   - CCS disabled / no remote selection → local `synthetics-*`.
 *   - "Use all remote clusters"          → `synthetics-*,*:synthetics-*`.
 *   - Specific clusters selected         → `synthetics-*,<cluster>:synthetics-*,…`.
 *
 * Unlike the server, disconnected clusters are not filtered out here: CCS treats
 * unavailable remotes as skippable, so an offline selected cluster simply
 * contributes no data rather than failing the query.
 */
export const buildOverviewSyntheticsIndices = ({
  isCCSEnabled,
  useAllRemoteClusters,
  selectedRemoteClusters,
}: BuildArgs): string => {
  if (!isCCSEnabled) {
    return SYNTHETICS_INDEX_PATTERN;
  }
  if (useAllRemoteClusters) {
    return `${SYNTHETICS_INDEX_PATTERN},${getSyntheticsCcsIndex('*')}`;
  }
  if (selectedRemoteClusters.length === 0) {
    return SYNTHETICS_INDEX_PATTERN;
  }
  return [
    SYNTHETICS_INDEX_PATTERN,
    ...selectedRemoteClusters.map((name) => getSyntheticsCcsIndex(name)),
  ].join(',');
};

export interface OverviewDataViewIndexPatterns {
  dataTypesIndexPatterns: DataTypesIndexPatterns;
  /**
   * True while the CCS settings needed to resolve the synthetics index pattern
   * are still loading. Consumers MUST wait for this to be `false` before
   * mounting the `ExploratoryViewEmbeddable`: the embeddable latches the first
   * data view title it sees (see `useAppDataView`) and never updates it, so
   * mounting with the interim local pattern would pin the viz to local-only
   * data even after the CCS pattern resolves.
   */
  loading: boolean;
}

/**
 * Overview-page counterpart to `useSyntheticsDataViewIndexPatterns`. The Overview
 * spans every monitor (not a single `remoteName`), so it resolves the synthetics
 * index pattern from the saved CCS settings instead of the URL `remoteName`.
 *
 * Returns only the `synthetics` data type: synthetics alerts are not yet queried
 * over CCS, so the Alerts panel intentionally keeps the platform default.
 */
export const useOverviewDataViewIndexPatterns = (): OverviewDataViewIndexPatterns => {
  const { isCCSEnabled = false } = useSyntheticsSettingsContext();

  // Keyed on `isCCSEnabled` (not the page refresh) so settings are fetched once
  // rather than on every Overview auto-refresh, and the request is skipped
  // entirely when CCS is unavailable (e.g. serverless).
  const { data } = useFetcher(
    async () => (isCCSEnabled ? fetchCCSSettings() : DEFAULT_CCS_SETTINGS),
    [isCCSEnabled]
  );

  const dataTypesIndexPatterns = useMemo<DataTypesIndexPatterns>(
    () => ({
      synthetics: buildOverviewSyntheticsIndices({
        isCCSEnabled,
        useAllRemoteClusters: data?.useAllRemoteClusters ?? false,
        selectedRemoteClusters: data?.selectedRemoteClusters ?? [],
      }),
    }),
    [isCCSEnabled, data?.useAllRemoteClusters, data?.selectedRemoteClusters]
  );

  // Non-CCS deployments resolve synchronously to the local pattern; only block
  // the first render while CCS settings are still in flight.
  const loading = isCCSEnabled && !data;

  return { dataTypesIndexPatterns, loading };
};

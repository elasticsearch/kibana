/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { getSyntheticsCcsIndex } from '../../../../../../common/get_synthetics_indices';
import {
  ConfigKey,
  type MonitorTypeEnum,
  type RemoteSyntheticsMonitor,
} from '../../../../../../common/runtime_types';
import { useSyntheticsRefreshContext } from '../../../contexts';

interface UseRemoteMonitorParams {
  configId: string;
  remoteName: string | undefined;
}

interface UseRemoteMonitorResult {
  data: RemoteSyntheticsMonitor | undefined;
  loading: boolean;
  error: Error | undefined;
}

interface LatestPingSource {
  monitor?: {
    id?: string;
    name?: string;
    type?: string;
  };
  tags?: string[];
  remote?: {
    remoteName?: string;
    kibanaUrl?: string;
  };
  kibanaUrl?: string;
}

/**
 * Synthesize a {@link RemoteSyntheticsMonitor} for a monitor that lives on a
 * remote cluster (CCS) by querying remote heartbeat indices via Cross-Cluster
 * Search.
 *
 * Activation: short-circuits when `remoteName` is falsy. In that case returns
 * `{ data: undefined, loading: false, error: undefined }` so the same hook can
 * be called unconditionally from a component (React rules of hooks).
 *
 * Query shape (one ES roundtrip):
 *   - index: `${remoteName}:${SYNTHETICS_INDEX_PATTERN}`
 *   - filter: `term: { config_id: configId }` — works for both regular and
 *     project monitors because both ping types carry `config_id`. `monitor.id`
 *     is then read OFF the latest hit (it's the project script id for project
 *     monitors, configId otherwise).
 *   - size: 1, sort `@timestamp desc` → latest ping supplies name/type/tags/remote.
 *   - terms agg on `observer.name` (the location id field in ping documents)
 *     with sub `terms` agg (size: 1) for `observer.geo.name` (the human-readable
 *     label, wildcard-typed so top_metrics cannot collect it; same pattern used
 *     server-side in overview_status_service for the same reason)
 *     → full set of locations the monitor has run from on the remote cluster.
 *
 * Three terminal states (see contract in `RemoteSyntheticsMonitor` JSDoc):
 *   - Loading first response (or key changed): `data: undefined, loading: true`.
 *   - Reachable + has pings: `data: <monitor>, loading: false`.
 *   - Reachable + no pings (dormant/missing): `data: undefined, loading: false,
 *     error: undefined`. Consumer should render an empty state, NOT an error.
 *   - Remote unreachable / permission denied / unknown cluster: `data: undefined,
 *     loading: false, error: <Error>`.
 *
 * Refresh: re-fetches on `configId`/`remoteName` change and on every tick from
 * `useSyntheticsRefreshContext` (consistent with `useMonitorDetail`).
 *
 * NOT a Redux action — does not touch `selectorMonitorDetailsState`. Intended
 * to be composed inside `useSelectedMonitor`, not consumed directly from UI
 * components.
 */
export const useRemoteMonitor = ({
  configId,
  remoteName,
}: UseRemoteMonitorParams): UseRemoteMonitorResult => {
  const { lastRefresh } = useSyntheticsRefreshContext();

  // Empty index short-circuits useEsSearch internally (its useFetcher guards on
  // params.index truthiness), so the query is only issued when remoteName is set.
  const index = remoteName ? getSyntheticsCcsIndex(remoteName) : '';

  const { data, loading, error } = useSyntheticsEsSearch(
    {
      index,
      size: 1,
      query: {
        bool: {
          filter: [{ term: { config_id: configId } }],
        },
      },
      sort: [{ '@timestamp': 'desc' as const }],
      aggs: {
        locations: {
          terms: {
            // observer.name is the location id field in ping documents
            // (observer.geo.name is the human-readable label, resolved below
            // via a terms sub-agg because it is a wildcard-typed field).
            field: 'observer.name',
            size: 100,
          },
          aggs: {
            label: {
              terms: {
                field: 'observer.geo.name',
                size: 1,
              },
            },
          },
        },
      },
    },
    [lastRefresh, configId, remoteName],
    { name: 'getRemoteSyntheticsMonitor' }
  );

  const monitor = useMemo<RemoteSyntheticsMonitor | undefined>(() => {
    if (!remoteName || !data?.hits?.hits?.length) {
      return undefined;
    }

    const ping = data.hits.hits[0]._source as LatestPingSource;
    const buckets = data.aggregations?.locations?.buckets ?? [];
    const locations = buckets.map((bucket) => {
      const labelKey = bucket.label?.buckets?.[0]?.key;
      return {
        id: String(bucket.key),
        label: labelKey != null ? String(labelKey) : String(bucket.key),
      };
    });

    const kibanaUrl = ping.remote?.kibanaUrl ?? ping.kibanaUrl;

    return {
      [ConfigKey.CONFIG_ID]: configId,
      [ConfigKey.MONITOR_QUERY_ID]: ping.monitor?.id ?? configId,
      [ConfigKey.NAME]: ping.monitor?.name ?? '',
      [ConfigKey.MONITOR_TYPE]: (ping.monitor?.type ?? 'browser') as MonitorTypeEnum,
      [ConfigKey.TAGS]: ping.tags ?? [],
      [ConfigKey.LOCATIONS]: locations,
      remote: {
        remoteName,
        ...(kibanaUrl ? { kibanaUrl } : {}),
      },
    };
  }, [configId, remoteName, data]);

  return {
    data: monitor,
    loading: Boolean(loading),
    error: error as Error | undefined,
  };
};

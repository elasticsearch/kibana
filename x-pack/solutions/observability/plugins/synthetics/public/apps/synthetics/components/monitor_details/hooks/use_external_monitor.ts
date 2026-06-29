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
  type ExternalSyntheticsMonitor,
  type MonitorOrigin,
  type MonitorTypeEnum,
} from '../../../../../../common/runtime_types';
import { useSyntheticsRefreshContext } from '../../../contexts';

interface UseExternalMonitorParams {
  configId: string;
  /** Set for CCS monitors — queries `${remoteName}:synthetics-*`. */
  remoteName?: string;
  /** Set to `'heartbeat'` for local Heartbeat/Agent monitors — queries local `synthetics-*`. */
  origin?: MonitorOrigin;
}

interface UseExternalMonitorResult {
  data: ExternalSyntheticsMonitor | undefined;
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
 * Synthesize a read-only {@link ExternalSyntheticsMonitor} from ping data for a
 * monitor that has no local Synthetics saved object. Handles both flavors with
 * one query because they differ only by index and discriminant:
 *   - remote (CCS): `remoteName` set → index `${remoteName}:synthetics-*`,
 *     result carries `remote: { remoteName, kibanaUrl? }`.
 *   - heartbeat: `origin: 'heartbeat'` (no `remoteName`) → local `synthetics-*`
 *     (`getSyntheticsCcsIndex(undefined)` returns the local pattern), result
 *     carries `origin: 'heartbeat'`.
 *
 * Activation: short-circuits when neither `remoteName` nor `origin` is set,
 * returning `{ data: undefined, loading: false, error: undefined }` so the hook
 * can be called unconditionally (React rules of hooks) without issuing a query.
 *
 * Query shape (one ES roundtrip):
 *   - filter `term: { config_id: configId }` for remote (CCS) monitors;
 *     `term: { 'monitor.id': configId }` for heartbeat monitors, whose pings
 *     carry no `config_id`.
 *   - size 1, sort `@timestamp desc` → latest ping supplies name/type/tags/remote.
 *   - terms agg on `observer.name` (location id) with a `terms` sub-agg (size 1)
 *     on `observer.geo.name` (wildcard-typed label) → full location set.
 *
 * Terminal states mirror the projection's contract: loading; reachable + pings
 * → data; reachable + no pings (dormant/missing) → undefined, no error;
 * unreachable / permission denied → Error.
 *
 * Refresh: re-fetches on `configId`/`remoteName`/`origin` change and on every
 * `useSyntheticsRefreshContext` tick. Intended to be composed inside
 * `useSelectedMonitor`, not consumed directly from UI components.
 */
export const useExternalMonitor = ({
  configId,
  remoteName,
  origin,
}: UseExternalMonitorParams): UseExternalMonitorResult => {
  const { lastRefresh } = useSyntheticsRefreshContext();

  const enabled = Boolean(remoteName) || origin === 'heartbeat';

  // Empty index short-circuits useEsSearch internally (its useFetcher guards on
  // params.index truthiness). For heartbeat, remoteName is falsy so
  // getSyntheticsCcsIndex returns the local pattern.
  const index = enabled ? getSyntheticsCcsIndex(remoteName) : '';

  // Remote (CCS) monitors are real saved objects on the origin cluster, so they
  // are addressable by `config_id`. Heartbeat/Agent autodiscovered monitors have
  // no saved object and their pings carry no `config_id` — their identity is
  // `monitor.id` (the canonical ping identity field, and what the overview and
  // detail routes key them by). Matching `config_id` for heartbeat would return
  // zero hits and the detail page would render "monitor not found".
  const identityFilter =
    origin === 'heartbeat' && !remoteName
      ? { term: { 'monitor.id': configId } }
      : { term: { config_id: configId } };

  const { data, loading, error } = useSyntheticsEsSearch(
    {
      index,
      size: 1,
      query: {
        bool: {
          filter: [identityFilter],
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
    [lastRefresh, configId, remoteName, origin],
    { name: 'getExternalSyntheticsMonitor' }
  );

  const monitor = useMemo<ExternalSyntheticsMonitor | undefined>(() => {
    if (!enabled || !data?.hits?.hits?.length) {
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

    const base = {
      [ConfigKey.CONFIG_ID]: configId,
      [ConfigKey.MONITOR_QUERY_ID]: ping.monitor?.id ?? configId,
      [ConfigKey.NAME]: ping.monitor?.name ?? '',
      [ConfigKey.MONITOR_TYPE]: (ping.monitor?.type ?? 'browser') as MonitorTypeEnum,
      [ConfigKey.TAGS]: ping.tags ?? [],
      [ConfigKey.LOCATIONS]: locations,
    };

    if (remoteName) {
      const kibanaUrl = ping.remote?.kibanaUrl ?? ping.kibanaUrl;
      return {
        ...base,
        remote: {
          remoteName,
          ...(kibanaUrl ? { kibanaUrl } : {}),
        },
      };
    }

    return { ...base, origin: 'heartbeat' as const };
  }, [enabled, configId, remoteName, data]);

  // While enabled, treat the probe as loading until it has produced a definitive
  // result (a response or an error). `useFetcher` reports `loading: false` for the
  // single render where the query *becomes* enabled — its effect starts the fetch
  // only after that render — so relying on `loading` alone briefly signals "no
  // data, not loading". `useSelectedMonitor` would read that as `isMonitorMissing`
  // and redirect to the not-found page before the heartbeat probe ever runs.
  const hasResult = data !== undefined || error !== undefined;

  return {
    data: monitor,
    loading: enabled ? Boolean(loading) || !hasResult : false,
    error: error as Error | undefined,
  };
};

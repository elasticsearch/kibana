/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSyntheticsEsSearch } from '../../../hooks/use_synthetics_es_search';
import { getSyntheticsCcsIndex } from '../../../../../../common/get_synthetics_indices';
import {
  ConfigKey,
  isRemoteSyntheticsMonitor,
  type Ping,
} from '../../../../../../common/runtime_types';
import { useGetUrlParams } from '../../../hooks';
import { useSyntheticsRefreshContext } from '../../../contexts';
import { getMonitorLastRunAction, selectLastRunMetadata } from '../../../state';
import { useSelectedLocation } from './use_selected_location';
import { useSelectedMonitor } from './use_selected_monitor';

interface UseMonitorLatestPingParams {
  monitorId?: string;
}

export const useMonitorLatestPing = (params?: UseMonitorLatestPingParams) => {
  const dispatch = useDispatch();
  const { lastRefresh } = useSyntheticsRefreshContext();
  const { remoteName } = useGetUrlParams();
  const isRemote = Boolean(remoteName);

  const { monitor } = useSelectedMonitor();
  const location = useSelectedLocation();

  const monitorId = params?.monitorId ?? monitor?.id;
  const locationLabel = location?.label;

  const { data: latestPing, loading, loaded } = useSelector(selectLastRunMetadata);

  // Mirror of the SO-backed REST route but issued client-side via CCS so the
  // remote branch never depends on Redux state populated by the local route.
  // Called unconditionally to obey the rules of hooks; short-circuits inside
  // when remoteName/monitorId are unavailable.
  const remote = useRemoteMonitorLatestPing({ monitorId, locationLabel, remoteName });

  const latestPingId = latestPing?.monitor.id;

  // CUSTOM_HEARTBEAT_ID is the project-monitor override on the local SO; remote
  // monitors don't expose it (their `monitor.id` already equals the ping's
  // monitor.id), so the equality check above is sufficient for remote.
  const customHeartbeatId =
    monitor && !isRemoteSyntheticsMonitor(monitor)
      ? monitor[ConfigKey.CUSTOM_HEARTBEAT_ID]
      : undefined;
  const isIdSame = latestPingId === monitorId || latestPingId === customHeartbeatId;

  const isLocationSame = latestPing?.observer?.geo?.name === locationLabel;

  const isUpToDate = isIdSame && isLocationSame;

  useEffect(() => {
    // The local SO-backed route can't see remote heartbeat indices, so the
    // dispatch would always come back empty for remote configIds. Skip it.
    if (!isRemote && monitorId && locationLabel) {
      dispatch(getMonitorLastRunAction.get({ monitorId, locationLabel }));
    }
  }, [dispatch, monitorId, locationLabel, isUpToDate, lastRefresh, isRemote]);

  if (isRemote) {
    return remote;
  }

  if (!monitorId || !locationLabel || !latestPing) {
    return { loading, latestPing: undefined, loaded };
  }

  if (!isIdSame || !isLocationSame) {
    return { loading, latestPing: undefined, loaded };
  }

  return { loading, latestPing, loaded };
};

/**
 * Client-side CCS variant of the SO-backed `getLatestTestRun` route. Mirrors
 * the same filter set (monitor.id + optional locationLabel + summary exists)
 * but targets `${remoteName}:${SYNTHETICS_INDEX_PATTERN}`. Used only by the
 * remote branch of {@link useMonitorLatestPing}.
 *
 * Loading semantics: while we wait for `useSelectedMonitor` to resolve the
 * remote monitor (and therefore `monitorId`), `loaded` stays `false` so the
 * page wrapper keeps showing the loading spinner instead of flashing the
 * "initial test run pending" empty state.
 */
const useRemoteMonitorLatestPing = ({
  monitorId,
  locationLabel,
  remoteName,
}: {
  monitorId: string | undefined;
  locationLabel: string | undefined;
  remoteName: string | undefined;
}): { latestPing: Ping | undefined; loading: boolean; loaded: boolean } => {
  const { lastRefresh } = useSyntheticsRefreshContext();

  const canQuery = Boolean(remoteName && monitorId);
  const index = canQuery ? getSyntheticsCcsIndex(remoteName) : '';

  const { data, loading } = useSyntheticsEsSearch(
    {
      index,
      size: 1,
      query: {
        bool: {
          filter: [
            { term: { 'monitor.id': monitorId } },
            ...(locationLabel ? [{ term: { 'observer.geo.name': locationLabel } }] : []),
            { exists: { field: 'summary' } },
          ],
        },
      },
      sort: [{ '@timestamp': 'desc' as const }],
    },
    [lastRefresh, monitorId, locationLabel, remoteName],
    { name: 'getRemoteMonitorLatestPing' }
  );

  const latestPing = data?.hits?.hits?.[0]?._source as Ping | undefined;

  return {
    latestPing: canQuery ? latestPing : undefined,
    loading: canQuery ? Boolean(loading) : Boolean(remoteName),
    loaded: canQuery ? !loading : false,
  };
};

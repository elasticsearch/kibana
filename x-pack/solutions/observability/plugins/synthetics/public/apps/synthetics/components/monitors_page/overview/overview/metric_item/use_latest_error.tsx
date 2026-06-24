/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { getRangeFilter } from '../../../../../../../../common/constants/client_defaults';
import { getSyntheticsCcsIndex } from '../../../../../../../../common/get_synthetics_indices';
import type { OverviewStatusMetaData, Ping } from '../../../../../../../../common/runtime_types';
import { useSyntheticsRefreshContext } from '../../../../../contexts';
import { useSyntheticsEsSearch } from '../../../../../hooks/use_synthetics_es_search';
import {
  getMonitorLastErrorRunAction,
  selectErrorPopoverState,
  selectLastErrorRunMetadata,
} from '../../../../../state';

interface UseMonitorLatestPingParams {
  configIdByLocation: string;
  monitor: OverviewStatusMetaData;
}

export const useLatestError = ({ monitor, configIdByLocation }: UseMonitorLatestPingParams) => {
  const dispatch = useDispatch();
  const { lastRefresh } = useSyntheticsRefreshContext();
  const isPopoverOpen = useSelector(selectErrorPopoverState);

  const { data: latestPing, loading } = useSelector(selectLastErrorRunMetadata);

  const remoteName = monitor.remote?.remoteName;
  const isRemote = Boolean(remoteName);
  const isOpenForThisMonitor = isPopoverOpen === configIdByLocation;
  const locationLabel = monitor?.locations?.[0]?.label;

  // `monitorQueryId` matches heartbeat `monitor.id` (diverges from `configId`
  // for project monitors with a `custom_heartbeat_id`).
  const remote = useRemoteMonitorLatestError({
    monitorId: monitor.monitorQueryId,
    locationLabel,
    remoteName,
    enabled: isRemote && isOpenForThisMonitor,
    lastRefresh,
  });

  useEffect(() => {
    if (!isRemote && locationLabel && isOpenForThisMonitor) {
      dispatch(getMonitorLastErrorRunAction.get({ monitorId: monitor.configId, locationLabel }));
    }
  }, [dispatch, lastRefresh, isOpenForThisMonitor, isRemote, locationLabel, monitor.configId]);

  if (isRemote) {
    return remote;
  }

  return { loading, latestPing };
};

// Client-side CCS variant of `getLatestTestRun`. Popover only renders for
// `down` monitors, so the latest ping with `summary` is the latest error run.
const useRemoteMonitorLatestError = ({
  monitorId,
  locationLabel,
  remoteName,
  enabled,
  lastRefresh,
}: {
  monitorId: string | undefined;
  locationLabel: string | undefined;
  remoteName: string | undefined;
  enabled: boolean;
  lastRefresh: number;
}): { latestPing: Ping | undefined; loading: boolean } => {
  const canQuery = enabled && Boolean(remoteName && monitorId);
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
            // Bound the search to avoid scanning frozen/cold tiers on the remote cluster;
            getRangeFilter({ from: 'now-30d', to: 'now' }),
          ],
        },
      },
      sort: [{ '@timestamp': 'desc' as const }],
    },
    [lastRefresh, monitorId, locationLabel, remoteName, canQuery],
    { name: 'getRemoteMonitorLatestError' }
  );

  const latestPing = canQuery ? (data?.hits?.hits?.[0]?._source as Ping | undefined) : undefined;

  return {
    latestPing,
    loading: canQuery ? Boolean(loading) : false,
  };
};

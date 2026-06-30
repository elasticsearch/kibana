/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSelector } from '@reduxjs/toolkit';
import { MONITOR_STATUS_ENUM } from '../../../../../common/constants/monitor_management';
import type {
  OverviewStatusMetaData,
  OverviewStatusState,
} from '../../../../../common/runtime_types';
import type { SyntheticsAppState } from '../root_reducer';

export const getStatusByConfig = (
  configId: string,
  status?: OverviewStatusState | null,
  locId?: string
) => {
  if (!status) {
    return MONITOR_STATUS_ENUM.PENDING;
  }
  // Look up the config across all status buckets so disabled and pending
  // monitors are not misreported as PENDING / UP / DOWN by accident.
  const configStatus =
    status.downConfigs[configId] ||
    status.upConfigs[configId] ||
    status.pendingConfigs[configId] ||
    status.staleConfigs?.[configId] ||
    status.disabledConfigs[configId];
  if (configStatus) {
    const config = configStatus?.locations.find((loc) => loc.id === locId);
    return config?.status ?? MONITOR_STATUS_ENUM.PENDING;
  } else {
    const configByIdLoc = configId + '-' + locId;
    const configS =
      status.downConfigs[configByIdLoc] ||
      status.upConfigs[configByIdLoc] ||
      status.pendingConfigs[configByIdLoc] ||
      status.staleConfigs?.[configByIdLoc] ||
      status.disabledConfigs[configByIdLoc];
    const config = configS?.locations.find((loc) => loc.id === locId);
    return config?.status ?? MONITOR_STATUS_ENUM.PENDING;
  }
};

export const selectOverviewStatus = createSelector(
  (state: SyntheticsAppState) => state.overviewStatus,
  (state: SyntheticsAppState) => state.overview.groupBy.field,
  (overviewStatus, groupByField) => {
    if (!overviewStatus.status) {
      return overviewStatus;
    }
    const status =
      groupByField === 'monitor'
        ? overviewStatus.status
        : formatStatus(overviewStatus.status, groupByField);

    return {
      ...overviewStatus,
      status: {
        ...status,
        up: Object.keys(status.upConfigs).length,
        down: Object.keys(status.downConfigs).length,
        pending: Object.keys(status.pendingConfigs).length,
        stale: Object.keys(status.staleConfigs ?? {}).length,
        disabledCount: Object.keys(status.disabledConfigs).length,
      },
    };
  }
);

/**
 * Resolve the status a monitor card/row should *render* with.
 *
 * `stale` monitors stay in their `stale` bucket (so the count and the
 * "Stale" filter keep working), but when the user enables "Show last run" we
 * want the card/row to surface the last-known up/down the server carried on the
 * location (`lastStatus`) instead of the neutral "Stale" treatment. This is a
 * presentation-only resolution — it never moves a monitor between buckets.
 *
 * Returns the unchanged `overallStatus` for every other case (including when
 * the toggle is off, or when no last-known status was carried).
 */
export const resolveDisplayStatus = (
  monitor: Pick<OverviewStatusMetaData, 'overallStatus' | 'locations'>,
  showLastRun: boolean
): string => {
  const status = monitor.overallStatus;
  if (!showLastRun || status !== MONITOR_STATUS_ENUM.STALE) {
    return status;
  }
  const locations = monitor.locations ?? [];
  if (!locations.some((loc) => loc.lastStatus)) {
    return status;
  }
  return locations.some((loc) => loc.lastStatus === MONITOR_STATUS_ENUM.DOWN)
    ? MONITOR_STATUS_ENUM.DOWN
    : MONITOR_STATUS_ENUM.UP;
};

type ConfigBuckets = Pick<
  OverviewStatusState,
  'upConfigs' | 'downConfigs' | 'pendingConfigs' | 'staleConfigs' | 'disabledConfigs'
>;

const bucketForStatus = (
  buckets: ConfigBuckets,
  status: string | undefined
): Record<string, OverviewStatusMetaData> | undefined => {
  switch (status) {
    case 'up':
      return buckets.upConfigs;
    case 'down':
      return buckets.downConfigs;
    case 'disabled':
      return buckets.disabledConfigs;
    case 'pending':
      return buckets.pendingConfigs;
    case 'stale':
      return buckets.staleConfigs;
    default:
      return undefined;
  }
};

const formatStatus = (status: OverviewStatusState, groupBy?: string): OverviewStatusState => {
  if (groupBy === 'monitor' || !status) {
    return status;
  }

  // Single-location monitors stay in their server-assigned bucket. For
  // multi-location monitors we split into one entry per location keyed
  // `${configId}-${locationId}`, and route each split entry to the bucket
  // matching the *per-location* status — otherwise e.g. a monitor with a
  // down + several pending locations leaves the pending splits inside
  // `downConfigs`, breaking sort-by-status and per-bucket consumers.
  const newBuckets: ConfigBuckets = {
    upConfigs: { ...(status.upConfigs ?? {}) },
    downConfigs: { ...(status.downConfigs ?? {}) },
    pendingConfigs: { ...(status.pendingConfigs ?? {}) },
    staleConfigs: { ...(status.staleConfigs ?? {}) },
    disabledConfigs: { ...(status.disabledConfigs ?? {}) },
  };

  const sourceBuckets: Array<
    [Record<string, OverviewStatusMetaData> | undefined, Record<string, OverviewStatusMetaData>]
  > = [
    [status.upConfigs, newBuckets.upConfigs],
    [status.downConfigs, newBuckets.downConfigs],
    [status.pendingConfigs, newBuckets.pendingConfigs],
    [status.staleConfigs, newBuckets.staleConfigs],
    [status.disabledConfigs, newBuckets.disabledConfigs],
  ];

  sourceBuckets.forEach(([source, target]) => {
    Object.entries(source ?? {}).forEach(([key, value]) => {
      if (value.locations.length <= 1) return;

      delete target[key];
      value.locations.forEach((location) => {
        const newKey = `${key}-${location.id}`;
        const entry: OverviewStatusMetaData = {
          ...value,
          overallStatus: location.status,
          locations: [location],
        };
        const destination = bucketForStatus(newBuckets, location.status) ?? target;
        destination[newKey] = entry;
      });
    });
  });

  return {
    ...status,
    ...newBuckets,
  };
};

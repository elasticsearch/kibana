/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';
import type { SavedObjectsFindResult } from '@kbn/core/server';
import type { Logger } from '@kbn/core/server';
import type { MonitorData } from '../../../saved_objects/synthetics_monitor/process_monitors';
import type {
  AlertStatusConfigs,
  AlertPendingStatusConfigs,
  MissingPingMonitorInfo,
} from '../../../../common/runtime_types/alert_rules/common';
import type { EncryptedSyntheticsMonitorAttributes } from '../../../../common/runtime_types';
import { ConfigKey } from '../../../../common/runtime_types';

export interface ConfigStats {
  up: number;
  down: number;
  pending: number;
}

export const getMissingPingMonitorInfo = ({
  monitors,
  configId,
  locationId,
}: {
  monitors: Array<SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes>>;
  configId: string;
  locationId: string;
}): (MissingPingMonitorInfo & { createdAt?: string }) | undefined => {
  const monitor = monitors.find(
    // for project monitors, we can match by id or by monitor query id
    (m) => m.id === configId || m.attributes[ConfigKey.MONITOR_QUERY_ID] === configId
  );
  if (!monitor) {
    // This should never happen
    return;
  }

  // For some reason 'urls' is not considered a valid attribute in the monitor attributes, there's probably a problem with the EncryptedSyntheticsMonitorAttributes type
  const fullUrl =
    'urls' in monitor.attributes && typeof monitor.attributes.urls === 'string'
      ? monitor.attributes.urls
      : '';

  return {
    monitor: {
      name: monitor.attributes.name,
      id: configId,
      type: monitor.attributes.type,
    },
    observer: {
      geo: {
        name: monitor.attributes.locations.find((l) => l.id === locationId)?.label || '',
      },
    },
    labels: monitor.attributes.labels,
    tags: monitor.attributes.tags,
    url: { full: fullUrl },
    createdAt: monitor.created_at,
  };
};

const isMonitorReadyForData = ({
  createdAt,
  monitorType,
}: {
  createdAt?: string;
  monitorType: string;
}) => {
  const waitMinutesBeforePending = monitorType === 'browser' ? 5 : 1;
  return (
    !createdAt ||
    (createdAt &&
      moment(createdAt).isBefore(moment().subtract(waitMinutesBeforePending, 'minutes')))
  );
};

export const getPendingConfigs = ({
  monitorQueryIds,
  monitorLocationIds,
  upConfigs,
  downConfigs,
  monitorsData,
  monitors,
  logger,
}: {
  monitorQueryIds: string[];
  monitorLocationIds: string[];
  upConfigs: AlertStatusConfigs;
  downConfigs: AlertStatusConfigs;
  monitorsData: Record<string, MonitorData>;
  monitors: Array<SavedObjectsFindResult<EncryptedSyntheticsMonitorAttributes>>;
  logger: Logger;
}) => {
  // Check if a config is missing, if it is it means that the monitor is pending
  const pendingConfigs: AlertPendingStatusConfigs = {};

  for (const monitorQueryId of monitorQueryIds) {
    // Resolve the saved object to get the canonical configId (SO UUID).
    // For regular monitors: configId === monitorQueryId.
    // For project monitors: configId is the SO UUID, monitorQueryId is the journey ID.
    const monitorSO = monitors.find(
      (m) => m.id === monitorQueryId || m.attributes[ConfigKey.MONITOR_QUERY_ID] === monitorQueryId
    );
    const configId = monitorSO?.id ?? monitorQueryId;

    for (const locationId of monitorLocationIds) {
      const configWithLocationId = `${configId}-${locationId}`;

      const isConfigMissing =
        !upConfigs[configWithLocationId] &&
        !downConfigs[configWithLocationId] &&
        monitorsData[monitorQueryId].locations.includes(locationId);

      if (isConfigMissing) {
        const res = getMissingPingMonitorInfo({
          configId: monitorQueryId,
          locationId,
          monitors,
        });
        if (res) {
          const { createdAt, ...monitorInfo } = res;
          if (
            isMonitorReadyForData({ monitorType: monitorsData[monitorQueryId].type, createdAt })
          ) {
            pendingConfigs[configWithLocationId] = {
              status: 'pending',
              configId,
              monitorQueryId,
              locationId,
              monitorInfo,
            };
          }
        } else {
          logger.error(
            `Config ${configWithLocationId} not added to pending configs because the monitor info is missing`
          );
        }
      }
    }
  }

  return pendingConfigs;
};

export const applyPendingCounts = (
  pendingConfigs: AlertPendingStatusConfigs,
  prevPendingConfigs: AlertPendingStatusConfigs = {}
): AlertPendingStatusConfigs => {
  const next: AlertPendingStatusConfigs = {};
  for (const [key, config] of Object.entries(pendingConfigs)) {
    const prev = prevPendingConfigs[key];
    // Persisted state from before pendingCount existed is treated as 1 prior evaluation.
    const prevCount = prev ? prev.pendingCount ?? 1 : 0;
    next[key] = {
      ...config,
      pendingCount: prevCount + 1,
    };
  }
  return next;
};

export const filterPendingConfigsByThreshold = (
  pendingConfigs: AlertPendingStatusConfigs,
  pendingThreshold: number
): AlertPendingStatusConfigs => {
  return Object.fromEntries(
    Object.entries(pendingConfigs).filter(
      ([, config]) => (config.pendingCount ?? 1) >= pendingThreshold
    )
  );
};

export const getConfigStats = ({
  monitorQueryIds,
  upConfigs,
  downConfigs,
  pendingConfigs,
}: {
  monitorQueryIds: string[];
  upConfigs: AlertStatusConfigs;
  downConfigs: AlertStatusConfigs;
  pendingConfigs: AlertPendingStatusConfigs;
}) => {
  // Pre-organize configs by monitorId for faster lookup
  const configsByMonitor = new Map<string, ConfigStats>();

  // Initialize all monitors with zero counts
  for (const monitorId of monitorQueryIds) {
    configsByMonitor.set(monitorId, { up: 0, down: 0, pending: 0 });
  }

  // Count up configs
  for (const configKey of Object.keys(upConfigs)) {
    const monitorId = upConfigs[configKey].monitorQueryId;
    const stats = configsByMonitor.get(monitorId);
    if (stats) stats.up++;
  }

  // Count down configs
  for (const configKey of Object.keys(downConfigs)) {
    const monitorId = downConfigs[configKey].monitorQueryId;
    const stats = configsByMonitor.get(monitorId);
    if (stats) stats.down++;
  }

  // Count pending configs
  for (const configKey of Object.keys(pendingConfigs)) {
    const monitorId = pendingConfigs[configKey].monitorQueryId;
    const stats = configsByMonitor.get(monitorId);
    if (stats) stats.pending++;
  }

  // Convert Map to the expected Record structure
  return Object.fromEntries(configsByMonitor.entries());
};

// Floor for the staleness buffer. Preserves historical behavior for 1-minute monitors:
// schedule (1m) + buffer (1m) = 2m allowed gap before a ping is considered stale.
const MINIMUM_STALENESS_BUFFER_FLOOR_MS = 60 * 1000;

// Fraction of the monitor's own schedule used as the staleness buffer when the schedule
// is large enough that the 60s floor is insufficient. e.g. a 10m monitor gets a 5m buffer
// (total 15m allowed gap) which absorbs typical ingest/scheduling jitter without
// significantly delaying genuine pending detection.
const SCHEDULE_PROPORTIONAL_BUFFER_RATIO = 0.5;

const getDefaultStalenessBufferMs = (scheduleInMs: number) =>
  Math.max(
    MINIMUM_STALENESS_BUFFER_FLOOR_MS,
    Math.round(scheduleInMs * SCHEDULE_PROPORTIONAL_BUFFER_RATIO)
  );

/**
 * `stalenessBufferMs` is the buffer portion added to `scheduleInMs`, not a total timeout.
 * Defaults to max(60s, 50% of schedule).
 */
export const calculateIsValidPing = ({
  previousRunEndTimeISO,
  scheduleInMs,
  previousRunDurationUs = 0,
  stalenessBufferMs,
}: {
  previousRunEndTimeISO: string;
  scheduleInMs: number;
  previousRunDurationUs?: number;
  stalenessBufferMs?: number;
}) => {
  const bufferMs = stalenessBufferMs ?? getDefaultStalenessBufferMs(scheduleInMs);
  const msSincePreviousRunEnd = new Date().getTime() - new Date(previousRunEndTimeISO).getTime();
  const stalenessThresholdMs = scheduleInMs + Math.max(bufferMs, previousRunDurationUs / 1000);

  // Example: a 1m monitor's last valid ping can be at (1+1)m; a 10m monitor's at (10+5)m.
  // If the gap exceeds the threshold the monitor is considered pending.
  return msSincePreviousRunEnd < stalenessThresholdMs;
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import type { ProjectMonitor, SyntheticsMonitor } from '../../../common/runtime_types';
import { ConfigKey, MonitorTypeEnum } from '../../../common/runtime_types';

interface MonitorWarning {
  monitorId: string;
  publicLocationIds: string[];
  message: string;
}

// Browser and API monitors both run via Heartbeat's synthexec runtime (api
// reuses browser.NewSourceJob per elastic/beats#50802); the public-location
// timeout limitation is identical for both.
const isSyntheticsScriptedType = (type?: string) =>
  type === MonitorTypeEnum.BROWSER || type === MonitorTypeEnum.API;

const buildScriptedMonitorTimeoutWarning = (
  monitorId: string,
  publicLocationIds: string[],
  monitorType: MonitorTypeEnum
): MonitorWarning => ({
  monitorId,
  message: i18n.translate(
    'xpack.synthetics.server.monitors.browserTimeoutNoPrivateLocationsWarning',
    {
      defaultMessage:
        'For {monitorType} monitors, timeout is only supported on private locations. Monitor {monitorId} specifies a timeout and is running on public locations: {publicLocationIds}. The timeout will have no effect on these locations.',
      values: { monitorId, monitorType, publicLocationIds: publicLocationIds.join(', ') },
    }
  ),
  publicLocationIds,
});

export const getBrowserTimeoutWarningForMonitor = (
  monitor: SyntheticsMonitor,
  monitorId: string
): MonitorWarning | null => {
  const monitorType = monitor[ConfigKey.MONITOR_TYPE];
  if (!isSyntheticsScriptedType(monitorType)) {
    return null;
  }
  if (!monitor[ConfigKey.TIMEOUT]) {
    return null;
  }
  const publicLocationIds = monitor.locations
    ?.filter((location) => location.isServiceManaged)
    .map((location) => location.id);
  if (publicLocationIds.length === 0) {
    return null;
  }
  return buildScriptedMonitorTimeoutWarning(
    monitorId,
    publicLocationIds,
    monitorType as MonitorTypeEnum
  );
};

export const getBrowserTimeoutWarningsForProjectMonitors = (
  monitors: ProjectMonitor[]
): MonitorWarning[] => {
  return monitors.reduce<MonitorWarning[]>((acc, monitor) => {
    if (
      isSyntheticsScriptedType(monitor.type) &&
      Boolean(monitor.timeout) &&
      (monitor.locations ?? []).length > 0
    ) {
      acc.push(
        buildScriptedMonitorTimeoutWarning(
          monitor.id,
          monitor.locations as string[],
          monitor.type as MonitorTypeEnum
        )
      );
    }

    return acc;
  }, []);
};

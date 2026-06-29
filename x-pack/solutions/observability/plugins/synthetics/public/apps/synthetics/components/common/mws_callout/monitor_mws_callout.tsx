/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { MwsCalloutContent } from './mws_callout_content';
import { MwsPendingSyncCallout } from './mws_pending_sync_callout';
import { useHasPendingMwChanges } from './use_has_pending_mw_changes';
import { ConfigKey, isExternalSyntheticsMonitor } from '../../../../../../common/runtime_types';
import { useSelectedMonitor } from '../../monitor_details/hooks/use_selected_monitor';

export const MonitorMWsCallout = () => {
  const { monitor } = useSelectedMonitor();

  // Maintenance window assignments live on the local saved object. Read-only
  // (remote / heartbeat) monitors expose no MW data, so skip the callout for them.
  const monitorMWIds =
    monitor && !isExternalSyntheticsMonitor(monitor)
      ? monitor[ConfigKey.MAINTENANCE_WINDOWS] ?? []
      : [];
  const { activeMWs, hasPendingChanges, syncInterval } = useHasPendingMwChanges(monitorMWIds);

  if (!monitor || isExternalSyntheticsMonitor(monitor)) {
    return null;
  }

  if (activeMWs.length) {
    return <MwsCalloutContent activeMWs={activeMWs} />;
  }

  if (hasPendingChanges) {
    return <MwsPendingSyncCallout syncInterval={syncInterval} />;
  }

  return null;
};

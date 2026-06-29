/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import moment from 'moment';

import { ConfigKey } from '../../../../../../common/constants/monitor_management';
import { isExternalSyntheticsMonitor, SourceType } from '../../../../../../common/runtime_types';
import { useRefreshedRange } from '../../../hooks';
import { useSelectedMonitor } from './use_selected_monitor';

export const useMonitorRangeFrom = () => {
  const { monitor, loading } = useSelectedMonitor();

  const { from, to } = useRefreshedRange(30, 'days');

  return useMemo(() => {
    // Read-only (remote / heartbeat) monitors are derived from pings — they have
    // no `created_at` and no project-monitor distinction available via the SO.
    // Always use the default 30-day lookback for them.
    if (monitor && !isExternalSyntheticsMonitor(monitor) && monitor.created_at) {
      const monitorCreatedDaysAgo = moment().diff(monitor.created_at, 'days');
      const isProjectMonitor = monitor[ConfigKey.MONITOR_SOURCE_TYPE] === SourceType.PROJECT;

      // Always look back at lest 3 days to account for reinstated project monitors.
      if ((!isProjectMonitor || monitorCreatedDaysAgo > 3) && monitorCreatedDaysAgo < 30) {
        return { to, from: monitor.created_at, loading };
      }
    }
    return { to, from, loading };
  }, [monitor, to, from, loading]);
};

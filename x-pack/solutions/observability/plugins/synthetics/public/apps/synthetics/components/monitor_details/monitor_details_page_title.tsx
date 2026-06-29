/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { MonitorSelector } from './monitor_selector/monitor_selector';
import { useSelectedMonitor } from './hooks/use_selected_monitor';
import {
  isHeartbeatSyntheticsMonitor,
  isRemoteSyntheticsMonitor,
} from '../../../../../common/runtime_types';
import { SyntheticsRemoteBadge } from '../common/components/synthetics_remote_badge';
import { SyntheticsHeartbeatBadge } from '../common/components/synthetics_heartbeat_badge';

export const MonitorDetailsPageTitle = () => {
  const { monitor } = useSelectedMonitor();

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false} data-test-subj="monitorNameTitle">
        {monitor?.name}
      </EuiFlexItem>
      {isRemoteSyntheticsMonitor(monitor) && (
        <EuiFlexItem grow={false}>
          <SyntheticsRemoteBadge remote={monitor.remote} />
        </EuiFlexItem>
      )}
      {isHeartbeatSyntheticsMonitor(monitor) && (
        <EuiFlexItem grow={false}>
          <SyntheticsHeartbeatBadge origin={monitor.origin} />
        </EuiFlexItem>
      )}
      <EuiFlexItem>
        <MonitorSelector />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

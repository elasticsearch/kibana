/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useHistory } from 'react-router-dom';
import { TagsList } from '@kbn/observability-shared-plugin/public';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { LocationsBadge } from './locations_badge';
import { MonitorTypeBadge } from '../../../../common/components/monitor_type_badge';
import { SyntheticsRemoteBadge } from '../../../../common/components/synthetics_remote_badge';
import { SyntheticsHeartbeatBadge } from '../../../../common/components/synthetics_heartbeat_badge';
import * as labels from '../../../management/monitor_list_table/labels';
import type { OverviewStatusMetaData } from '../../../../../../../../common/runtime_types';

export const MetricItemBody = ({
  monitor,
  onLocationClick,
}: {
  monitor: OverviewStatusMetaData;
  onLocationClick?: (locationId: string, locationLabel: string) => void;
}) => {
  const tags = monitor.tags;
  const history = useHistory();

  const typeBadge = (
    <MonitorTypeBadge
      monitorType={monitor.type}
      ariaLabel={labels.getFilterForTypeMessage(monitor.type)}
      onClick={() => {
        history.push({
          search: `monitorTypes=${encodeURIComponent(JSON.stringify([monitor.type]))}`,
        });
      }}
    />
  );
  // Each badge is its own flex item — EuiFlexItem is a flex column, so placing
  // multiple badges in one item would stack them vertically.
  const badges = (
    <EuiFlexGroup gutterSize="xs" responsive={false} wrap alignItems="center">
      <EuiFlexItem grow={false}>{typeBadge}</EuiFlexItem>
      {monitor.remote && (
        <EuiFlexItem grow={false}>
          <SyntheticsRemoteBadge remote={monitor.remote} />
        </EuiFlexItem>
      )}
      {monitor.origin === 'heartbeat' && (
        <EuiFlexItem grow={false}>
          <SyntheticsHeartbeatBadge origin={monitor.origin} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
  if (tags.length === 0 && (monitor?.locations?.length ?? 0) <= 1) {
    return (
      <>
        <EuiSpacer size="xs" />
        {badges}
      </>
    );
  }

  return (
    <>
      <EuiSpacer size="xs" />
      <EuiFlexGroup gutterSize="xs" alignItems="center" wrap>
        <EuiFlexItem grow={false}>{badges}</EuiFlexItem>
        {monitor?.locations?.length > 1 && (
          <EuiFlexItem grow={false}>
            <LocationsBadge monitor={monitor} onLocationClick={onLocationClick} />
          </EuiFlexItem>
        )}
        {(tags ?? []).length > 0 && (
          <EuiFlexItem grow={false}>
            <TagsList
              color="default"
              tags={tags}
              disableExpand={true}
              onClick={(tag) => {
                history.push({ search: `tags=${encodeURIComponent(JSON.stringify([tag]))}` });
              }}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React from 'react';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';
import type { ServiceNodeData } from '../../../../common/service_map';
import { AlertsBadge } from '../../shared/badge/alerts_badge';
import { SloStatusBadge } from '../../shared/slo_status_badge';
import { useServiceMapSloFlyout } from '../../shared/service_map/service_map_slo_flyout_context';
import { useServiceMapAlertsTabNavigate } from './use_service_map_alerts_tab_href';

interface Props {
  nodeData: ServiceNodeData;
}

/**
 * Alert and SLO badges next to the service map popover title — same behaviour as
 * {@link ServiceNode} badges on the map.
 */
export function ServiceMapPopoverTitleBadges({ nodeData }: Props) {
  const { core } = useApmPluginContext();
  const canReadSlos = !!core.application?.capabilities?.slo?.read;
  const { onSloBadgeClick } = useServiceMapSloFlyout();

  const serviceName = nodeData.label;
  const navigateToAlertsTab = useServiceMapAlertsTabNavigate(serviceName);

  const showAlertsBadge = nodeData.alertsCount !== undefined && nodeData.alertsCount > 0;
  const showSloBadge =
    canReadSlos && (nodeData.sloStatus === 'violated' || nodeData.sloStatus === 'degrading');

  if (!showAlertsBadge && !showSloBadge) {
    return null;
  }

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      {showAlertsBadge && (
        <EuiFlexItem grow={false}>
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <AlertsBadge
              count={nodeData.alertsCount ?? 0}
              serviceName={serviceName}
              data-test-subj="serviceMapPopoverAlertsBadge"
              onClick={navigateToAlertsTab}
            />
          </span>
        </EuiFlexItem>
      )}
      {showSloBadge && nodeData.sloStatus && (
        <EuiFlexItem grow={false}>
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <SloStatusBadge
              sloStatus={nodeData.sloStatus}
              sloCount={nodeData.sloCount}
              serviceName={serviceName}
              compactLabelOnNarrowScreens
              {...(onSloBadgeClick
                ? {
                    onClick: (e) => {
                      e.stopPropagation();
                      onSloBadgeClick(serviceName, nodeData.agentName);
                    },
                  }
                : { hideTooltip: true })}
            />
          </span>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
}

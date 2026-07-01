/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Service node rendered inside the React Flow Service Map. Lives under
 * `components/shared/` because it is consumed by both the main Service Map
 * (`components/app/service_map/graph.tsx`) and the Agent Builder service map
 * attachment. "Shared" here means intra-APM reuse only — the component still
 * imports APM plugin context and APM-specific badges. Optional behaviors
 * (alerts-tab navigation, SLO flyout) are injected via sibling React contexts
 * so they no-op gracefully when the surrounding providers are absent.
 */

import React, { useMemo, memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { useEuiTheme, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { getAgentIcon } from '@kbn/custom-icons';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { EBT_CLICK_ACTIONS, getEbtProps } from '@kbn/ebt-click';
import { getSeverity, getSeverityColor } from '../../../../common/anomaly_detection';
import type { ServiceNodeData } from '../../../../common/service_map';
import {
  NODE_BORDER_WIDTH_DEFAULT,
  NODE_BORDER_WIDTH_SELECTED,
  SERVICE_NODE_CIRCLE_SIZE,
} from '../../../../common/service_map/constants';
import { NodeLabel } from './node_label';
import { useApmPluginContext } from '../../../context/apm_plugin/use_apm_plugin_context';
import { AlertsBadge } from '../badge/alerts_badge';
import { SloStatusBadge } from '../slo_status_badge';
import { useServiceMapSloFlyout } from './service_map_slo_flyout_context';
import { useServiceMapAlertsNavigate } from './service_map_alerts_navigate_context';
import { HighlightWrapper } from './highlight_wrapper';
import { SERVICE_MAP_EBT_ELEMENTS } from './ebt_constants';

type ServiceNodeType = Node<ServiceNodeData, 'service'>;

export const ServiceNode = memo(
  ({ data, selected, sourcePosition, targetPosition }: NodeProps<ServiceNodeType>) => {
    const contextHighlight = Boolean(data.contextHighlight);
    const { euiTheme, colorMode } = useEuiTheme();
    // Optional-chain the APM plugin context: this component also renders in the
    // Agent Builder service map attachment, where no APM plugin provider is wrapped
    // and the default context value is `{}`. An empty context means no SLO read
    // capability is exposed, which intentionally suppresses SLO badges there.
    const apmPluginContext = useApmPluginContext();
    const canReadSlos = !!apmPluginContext?.core?.application?.capabilities?.slo?.read;
    const { onSloBadgeClick } = useServiceMapSloFlyout();
    const navigateToAlertsTab = useServiceMapAlertsNavigate(data.label);
    const isDarkMode = colorMode === 'DARK';

    const { borderColor, borderWidth } = useMemo(() => {
      const score = data.serviceAnomalyStats?.anomalyScore;
      const hasScore = score !== undefined;

      return {
        borderColor: hasScore
          ? getSeverityColor(score)
          : selected
          ? euiTheme.colors.primary
          : euiTheme.colors.mediumShade,
        borderWidth: selected
          ? `${NODE_BORDER_WIDTH_SELECTED}px`
          : `${NODE_BORDER_WIDTH_DEFAULT}px`,
      };
    }, [data.serviceAnomalyStats, selected, euiTheme]);

    const iconUrl = useMemo(() => {
      if (data.agentName) {
        return getAgentIcon(data.agentName, isDarkMode);
      }
      return null;
    }, [data.agentName, isDarkMode]);

    // Build accessible label for screen readers
    const ariaLabel = useMemo(() => {
      const parts = [
        i18n.translate('xpack.apm.serviceMap.serviceNode.ariaLabel', {
          defaultMessage: 'Service: {serviceName}',
          values: { serviceName: data.label },
        }),
      ];

      if (data.agentName) {
        parts.push(
          i18n.translate('xpack.apm.serviceMap.serviceNode.agentInfo', {
            defaultMessage: 'Agent: {agentName}',
            values: { agentName: data.agentName },
          })
        );
      }

      if (data.serviceAnomalyStats?.anomalyScore !== undefined) {
        parts.push(
          i18n.translate('xpack.apm.serviceMap.serviceNode.anomalySeverityInfo', {
            defaultMessage: 'Machine learning anomaly severity: {severity}',
            values: { severity: getSeverity(data.serviceAnomalyStats.anomalyScore) },
          })
        );
      }

      return parts.join('. ');
    }, [data.label, data.agentName, data.serviceAnomalyStats?.anomalyScore]);

    const containerStyles = css`
      position: relative;
      width: ${SERVICE_NODE_CIRCLE_SIZE}px;
      height: ${SERVICE_NODE_CIRCLE_SIZE}px;
    `;

    const handleStyles = css`
      visibility: hidden;
    `;

    const circleStyles = css`
      width: ${SERVICE_NODE_CIRCLE_SIZE}px;
      height: ${SERVICE_NODE_CIRCLE_SIZE}px;
      border-radius: 50%;
      border: ${borderWidth} solid ${borderColor};
      background: ${euiTheme.colors.backgroundBasePlain};
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 ${euiTheme.size.xxs} ${euiTheme.size.xxs}
        ${euiTheme.colors.backgroundBaseSubdued};
      cursor: pointer;
      pointer-events: all;

      &:focus-visible {
        outline: ${euiTheme.border.width.thick} solid ${euiTheme.colors.primary};
        outline-offset: ${euiTheme.size.xxs};
      }

      [data-id]:focus &,
      [data-id]:focus-visible & {
        outline: ${euiTheme.border.width.thick} solid ${euiTheme.colors.primary};
        outline-offset: ${euiTheme.size.xxs};
      }
    `;

    const iconStyles = css`
      width: 60%;
      height: 60%;
      object-fit: contain;
      pointer-events: none;
    `;

    const badgesRowStyles = css`
      pointer-events: none;
      max-width: 220px;
      justify-content: center;
    `;

    const badgePointerEventsStyles = css`
      pointer-events: auto;
    `;

    // Match service inventory cells: show count when API merged data (no extra capability check;
    // `alerting:show` is enforced when opening linked views; badge is display-only here).
    const showAlertsBadge = data.alertsCount !== undefined && data.alertsCount > 0;

    // Map: only violated/degrading (inventory & header show all SLO statuses).
    const showSloBadge =
      canReadSlos && (data.sloStatus === 'violated' || data.sloStatus === 'degrading');

    return (
      <HighlightWrapper nodeId={data.id} contextHighlight={contextHighlight}>
        <EuiFlexGroup
          direction="column"
          alignItems="center"
          gutterSize="xs"
          responsive={false}
          data-test-subj={`serviceMapNode-service-${data.id}`}
        >
          <EuiFlexItem grow={false} css={containerStyles}>
            <Handle type="target" position={targetPosition ?? Position.Left} css={handleStyles} />
            <div
              data-test-subj="serviceMapNodeServiceCircle"
              css={circleStyles}
              role="button"
              tabIndex={0}
              aria-label={ariaLabel}
              aria-pressed={selected}
              {...getEbtProps({
                action: EBT_CLICK_ACTIONS.VIEW_SERVICE,
                element: SERVICE_MAP_EBT_ELEMENTS.SERVICE_NODE,
              })}
            >
              {iconUrl && (
                <img src={iconUrl} alt={data.agentName} css={iconStyles} aria-hidden="true" />
              )}
            </div>
            <Handle type="source" position={sourcePosition ?? Position.Right} css={handleStyles} />
          </EuiFlexItem>
          {(showAlertsBadge || showSloBadge) && (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup
                gutterSize="xs"
                alignItems="center"
                justifyContent="center"
                responsive={false}
                wrap
                css={badgesRowStyles}
              >
                {showAlertsBadge && (
                  <span
                    css={badgePointerEventsStyles}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <AlertsBadge
                      count={data.alertsCount ?? 0}
                      serviceName={data.label}
                      data-test-subj="serviceMapNodeAlertsBadge"
                      {...(navigateToAlertsTab ? { onClick: navigateToAlertsTab } : {})}
                    />
                  </span>
                )}
                {showSloBadge && data.sloStatus && (
                  <span
                    css={badgePointerEventsStyles}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <SloStatusBadge
                      sloStatus={data.sloStatus}
                      sloCount={data.sloCount}
                      serviceName={data.label}
                      compactLabelOnNarrowScreens
                      {...(onSloBadgeClick
                        ? {
                            onClick: (e) => {
                              e.stopPropagation();
                              onSloBadgeClick(data.label, data.agentName);
                            },
                          }
                        : { hideTooltip: true })}
                    />
                  </span>
                )}
              </EuiFlexGroup>
            </EuiFlexItem>
          )}
          <NodeLabel label={data.label} selected={selected} />
        </EuiFlexGroup>
      </HighlightWrapper>
    );
  }
);

ServiceNode.displayName = 'ServiceNode';

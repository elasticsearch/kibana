/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiAccordion,
  EuiBadge,
  EuiCallOut,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiHorizontalRule,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedDate, FormattedMessage, FormattedRelative } from '@kbn/i18n-react';

import type { Agent, ComponentHealth, OTelCollectorConfig } from '../../../../../common/types';

import type { OTelComponentType } from '../constants';
import { COMPONENT_TYPE_LABELS } from '../constants';
import {
  findComponentHealth,
  getComponentAccentColor,
  getComponentHealthStatus,
  getHealthStatusColor,
  getHealthStatusLabel,
  nanosToMs,
  type ComponentHealthStatus,
} from '../utils';

const NON_REPORTING_STATUSES: Array<Agent['status']> = [
  'offline',
  'inactive',
  'unenrolled',
  'uninstalled',
];

interface CollectorDetailHealthProps {
  health?: ComponentHealth;
  config?: OTelCollectorConfig;
  agentStatus?: Agent['status'];
  onComponentClick?: (
    componentId: string,
    componentType: OTelComponentType,
    pipelineId?: string
  ) => void;
  selectedComponentId?: string;
}

const FormattedAbsoluteTimestamp: React.FC<{ nanos: number }> = ({ nanos }) => (
  <FormattedDate
    value={nanosToMs(nanos)}
    year="numeric"
    month="numeric"
    day="numeric"
    hour="numeric"
    minute="numeric"
    second="numeric"
  />
);

const COMPONENT_TYPE_ORDER: OTelComponentType[] = [
  'receiver',
  'connector',
  'processor',
  'exporter',
];

interface PipelineComponentGroup {
  type: OTelComponentType;
  components: Array<{
    id: string;
    health?: ComponentHealth;
    status: ComponentHealthStatus;
  }>;
}

const ComponentItem: React.FC<{
  id: string;
  type: OTelComponentType;
  status: ComponentHealthStatus;
  lastError?: string;
  isSelected: boolean;
  onClick?: () => void;
}> = ({ id, type, status, lastError, isSelected, onClick }) => {
  const { euiTheme } = useEuiTheme();
  const accentColor = getComponentAccentColor(type, euiTheme);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      style={{
        display: 'block',
        width: 'fit-content',
        background: euiTheme.colors.backgroundBasePlain,
        border: `1px solid ${euiTheme.colors.borderBasePlain}`,
        borderLeft: `4px solid ${accentColor}`,
        borderRadius: euiTheme.border.radius.medium,
        padding: `${euiTheme.size.xs} ${euiTheme.size.s}`,
        marginBottom: euiTheme.size.xs,
        cursor: 'pointer',
        outline: isSelected ? `2px solid ${euiTheme.colors.primary}` : 'none',
        outlineOffset: -1,
      }}
      data-test-subj={`collectorHealthComponent-${type}:${id}`}
    >
      <EuiHealth color={getHealthStatusColor(status, euiTheme)}>
        <EuiText size="s" style={{ fontWeight: isSelected ? 600 : 400 }}>
          {id}
        </EuiText>
      </EuiHealth>
      {lastError && (
        <EuiText size="xs" style={{ paddingLeft: 16, marginTop: 2 }}>
          <EuiTextColor color="danger">{lastError}</EuiTextColor>
        </EuiText>
      )}
    </div>
  );
};

const PipelineAccordion: React.FC<{
  pipelineId: string;
  groups: PipelineComponentGroup[];
  health?: ComponentHealth;
  onComponentClick?: (
    componentId: string,
    componentType: OTelComponentType,
    pipelineId?: string
  ) => void;
  selectedComponentId?: string;
}> = ({ pipelineId, groups, health, onComponentClick, selectedComponentId }) => {
  const { euiTheme } = useEuiTheme();
  const accordionId = useGeneratedHtmlId({ prefix: `pipeline-${pipelineId}` });

  const totalComponents = groups.reduce((sum, g) => sum + g.components.length, 0);
  const healthyCount = groups.reduce(
    (sum, g) => sum + g.components.filter((c) => c.status === 'healthy').length,
    0
  );

  const unhealthyCount = totalComponents - healthyCount;

  return (
    <EuiAccordion
      id={accordionId}
      onToggle={(isOpen) => {
        if (isOpen && onComponentClick) {
          onComponentClick(pipelineId, 'pipeline', pipelineId);
        }
      }}
      buttonContent={
        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiHealth
              color={
                healthyCount === totalComponents
                  ? euiTheme.colors.backgroundFilledSuccess
                  : healthyCount === 0
                  ? euiTheme.colors.backgroundFilledDanger
                  : euiTheme.colors.backgroundFilledWarning
              }
            >
              <strong>{pipelineId}</strong>
            </EuiHealth>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {i18n.translate('xpack.fleet.collectorDetail.health.componentCount', {
                defaultMessage: '{count} {count, plural, one {component} other {components}}',
                values: { count: totalComponents },
              })}
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            {healthyCount === totalComponents ? (
              <EuiBadge color="success">
                {i18n.translate('xpack.fleet.collectorDetail.health.allHealthy', {
                  defaultMessage: '{count} healthy',
                  values: { count: healthyCount },
                })}
              </EuiBadge>
            ) : healthyCount === 0 ? (
              <EuiBadge color="danger">
                {i18n.translate('xpack.fleet.collectorDetail.health.allUnhealthy', {
                  defaultMessage: '{count} unhealthy',
                  values: { count: unhealthyCount },
                })}
              </EuiBadge>
            ) : (
              <EuiBadge color="warning">
                {i18n.translate('xpack.fleet.collectorDetail.health.mixedHealth', {
                  defaultMessage: '{healthyCount} healthy, {unhealthyCount} unhealthy',
                  values: { healthyCount, unhealthyCount },
                })}
              </EuiBadge>
            )}
          </EuiFlexItem>
        </EuiFlexGroup>
      }
      paddingSize="m"
      data-test-subj={`collectorHealthPipeline-${pipelineId}`}
    >
      <div style={{ marginLeft: 16 }}>
        {groups.map((group, index) => (
          <React.Fragment key={group.type}>
            {index > 0 && <EuiHorizontalRule margin="s" />}
            <EuiTitle size="xxs">
              <h5>{COMPONENT_TYPE_LABELS[group.type]}s</h5>
            </EuiTitle>
            <EuiSpacer size="xs" />
            {group.components.map((comp) => (
              <ComponentItem
                key={`${group.type}:${comp.id}`}
                id={comp.id}
                type={group.type}
                status={comp.status}
                lastError={comp.health?.last_error}
                isSelected={selectedComponentId === comp.id}
                onClick={
                  onComponentClick
                    ? () => onComponentClick(comp.id, group.type, pipelineId)
                    : undefined
                }
              />
            ))}
          </React.Fragment>
        ))}
      </div>
    </EuiAccordion>
  );
};

const ComponentHealthSectionHeader: React.FC<{
  pipelineGroups: Array<{ pipelineId: string; groups: PipelineComponentGroup[] }>;
  health: ComponentHealth;
}> = ({ pipelineGroups, health }) => {
  const totalComponents = pipelineGroups.reduce(
    (sum, pg) => sum + pg.groups.reduce((s, g) => s + g.components.length, 0),
    0
  );
  const totalHealthy = pipelineGroups.reduce(
    (sum, pg) =>
      sum +
      pg.groups.reduce((s, g) => s + g.components.filter((c) => c.status === 'healthy').length, 0),
    0
  );
  const totalUnhealthy = totalComponents - totalHealthy;

  return (
    <EuiFlexGroup gutterSize="s" alignItems="baseline" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiTitle size="xs">
          <h4>
            {i18n.translate('xpack.fleet.collectorDetail.health.componentHealthTitle', {
              defaultMessage: 'Component health',
            })}
          </h4>
        </EuiTitle>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        {totalHealthy === totalComponents ? (
          <EuiBadge color="success">
            {i18n.translate('xpack.fleet.collectorDetail.health.totalAllHealthy', {
              defaultMessage: '{count} healthy',
              values: { count: totalHealthy },
            })}
          </EuiBadge>
        ) : totalHealthy === 0 ? (
          <EuiBadge color="danger">
            {i18n.translate('xpack.fleet.collectorDetail.health.totalAllUnhealthy', {
              defaultMessage: '{count} unhealthy',
              values: { count: totalUnhealthy },
            })}
          </EuiBadge>
        ) : (
          <EuiBadge color="warning">
            {i18n.translate('xpack.fleet.collectorDetail.health.totalMixedHealth', {
              defaultMessage: '{healthyCount} healthy, {unhealthyCount} unhealthy',
              values: { healthyCount: totalHealthy, unhealthyCount: totalUnhealthy },
            })}
          </EuiBadge>
        )}
      </EuiFlexItem>
      {health.status_time_unix_nano && (
        <EuiFlexItem grow={false}>
          <EuiText size="xs" color="subdued">
            <FormattedMessage
              id="xpack.fleet.collectorDetail.health.componentHealthUpdated"
              defaultMessage="Updated {timestamp}"
              values={{
                timestamp: <FormattedAbsoluteTimestamp nanos={health.status_time_unix_nano} />,
              }}
            />
          </EuiText>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};

const resolveComponentType = (
  componentId: string,
  componentType: string,
  config: OTelCollectorConfig
): OTelComponentType => {
  if (config.connectors && componentId in config.connectors) {
    return 'connector';
  }
  return componentType as OTelComponentType;
};

export const CollectorDetailHealth: React.FC<CollectorDetailHealthProps> = ({
  health,
  config,
  agentStatus,
  onComponentClick,
  selectedComponentId,
}) => {
  const pipelineGroups = useMemo(() => {
    const pipelines = config?.service?.pipelines;
    if (!pipelines) return [];

    return Object.entries(pipelines).map(([pipelineId, pipeline]) => {
      const pipelineHealth = findComponentHealth(health, 'pipeline', pipelineId);
      const groups: PipelineComponentGroup[] = [];

      for (const type of COMPONENT_TYPE_ORDER) {
        const componentIds =
          type === 'receiver'
            ? pipeline.receivers
            : type === 'processor'
            ? pipeline.processors
            : type === 'exporter'
            ? pipeline.exporters
            : undefined;

        if (componentIds && componentIds.length > 0) {
          groups.push({
            type,
            components: componentIds.map((id) => {
              const componentHealth =
                findComponentHealth(pipelineHealth, resolveComponentType(id, type, config), id) ??
                findComponentHealth(health, resolveComponentType(id, type, config), id);
              return {
                id,
                health: componentHealth,
                status: getComponentHealthStatus(componentHealth),
              };
            }),
          });
        }
      }

      return { pipelineId, groups };
    });
  }, [config, health]);

  const { euiTheme } = useEuiTheme();

  if (agentStatus && NON_REPORTING_STATUSES.includes(agentStatus)) {
    return (
      <EuiCallOut
        color="warning"
        iconType="offline"
        announceOnMount={false}
        title={i18n.translate('xpack.fleet.otelUi.collectorDetail.health.offlineTitle', {
          defaultMessage: 'Collector is not active',
        })}
        data-test-subj="collectorDetailHealthOffline"
      >
        <p>
          {i18n.translate('xpack.fleet.otelUi.collectorDetail.health.offlineBody', {
            defaultMessage:
              'This collector is currently {status}. Health data is only available while the collector is running.',
            values: { status: agentStatus },
          })}
        </p>
      </EuiCallOut>
    );
  }

  if (!health) {
    return (
      <EuiText size="s" color="subdued" data-test-subj="collectorDetailHealthNoData">
        {i18n.translate('xpack.fleet.otelUi.collectorDetail.health.noData', {
          defaultMessage: 'No health data available',
        })}
      </EuiText>
    );
  }

  const overallStatus = getComponentHealthStatus(health);

  return (
    <>
      <EuiDescriptionList
        compressed
        type="column"
        data-test-subj="collectorDetailHealth"
        listItems={[
          {
            title: i18n.translate('xpack.fleet.otelUi.collectorDetail.health.statusLabel', {
              defaultMessage: 'Health status',
            }),
            description: (
              <EuiHealth color={getHealthStatusColor(overallStatus, euiTheme)}>
                {getHealthStatusLabel(overallStatus)}
              </EuiHealth>
            ),
          },
          {
            title: i18n.translate('xpack.fleet.otelUi.collectorDetail.health.startTimeLabel', {
              defaultMessage: 'Start time',
            }),
            description: health.start_time_unix_nano ? (
              <FormattedAbsoluteTimestamp nanos={health.start_time_unix_nano} />
            ) : (
              '-'
            ),
          },
          {
            title: i18n.translate('xpack.fleet.otelUi.collectorDetail.health.uptimeLabel', {
              defaultMessage: 'Uptime',
            }),
            description: health.start_time_unix_nano ? (
              <FormattedRelative value={nanosToMs(health.start_time_unix_nano)} />
            ) : (
              '-'
            ),
          },
          {
            title: i18n.translate(
              'xpack.fleet.otelUi.collectorDetail.health.lastHealthUpdateLabel',
              {
                defaultMessage: 'Last health update',
              }
            ),
            description: health.status_time_unix_nano ? (
              <FormattedAbsoluteTimestamp nanos={health.status_time_unix_nano} />
            ) : (
              '-'
            ),
          },
          ...(health.last_error
            ? [
                {
                  title: i18n.translate(
                    'xpack.fleet.otelUi.collectorDetail.health.lastErrorLabel',
                    { defaultMessage: 'Last error' }
                  ),
                  description: <EuiTextColor color="danger">{health.last_error}</EuiTextColor>,
                },
              ]
            : []),
        ]}
      />

      {pipelineGroups.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <ComponentHealthSectionHeader pipelineGroups={pipelineGroups} health={health} />
          <EuiSpacer size="m" />
          <EuiFlexGroup direction="column" gutterSize="s">
            {pipelineGroups.map(({ pipelineId, groups }) => (
              <EuiFlexItem key={pipelineId} grow={false}>
                <PipelineAccordion
                  pipelineId={pipelineId}
                  groups={groups}
                  health={health}
                  onComponentClick={onComponentClick}
                  selectedComponentId={selectedComponentId}
                />
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      )}
    </>
  );
};

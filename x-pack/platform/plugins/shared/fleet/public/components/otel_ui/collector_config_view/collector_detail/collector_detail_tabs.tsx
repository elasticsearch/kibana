/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';

import type { Agent, ComponentHealth, OTelCollectorConfig } from '../../../../../common/types';

import type { OTelComponentType } from '../constants';
import { YamlViewer } from '../yaml_viewer';
import { OTelComponentDetail } from '../component_detail';

import { CollectorDetailHealth } from './collector_detail_health';
import { CollectorDetailInfo } from './collector_detail_info';

type DetailTabId = 'health' | 'info' | 'yaml';

const DETAIL_TABS: Array<{ id: DetailTabId; name: string }> = [
  {
    id: 'health',
    name: i18n.translate('xpack.fleet.collectorDetailTabs.health', {
      defaultMessage: 'Health',
    }),
  },
  {
    id: 'info',
    name: i18n.translate('xpack.fleet.collectorDetailTabs.info', {
      defaultMessage: 'Info',
    }),
  },
  {
    id: 'yaml',
    name: i18n.translate('xpack.fleet.collectorDetailTabs.yaml', {
      defaultMessage: 'Config',
    }),
  },
];

interface ComponentSelection {
  componentId: string;
  componentType: OTelComponentType;
  pipelineId?: string;
}

interface CollectorDetailTabsProps {
  agent: Agent;
  config: OTelCollectorConfig;
  health?: ComponentHealth;
  isConfigLoading?: boolean;
}

export const CollectorDetailTabs: React.FC<CollectorDetailTabsProps> = ({
  agent,
  config,
  health,
  isConfigLoading,
}) => {
  const { euiTheme } = useEuiTheme();
  const [selectedTabId, setSelectedTabId] = useState<DetailTabId>('health');
  const [selectedComponent, setSelectedComponent] = useState<ComponentSelection | null>(null);

  const stickyDetailStyles = css`
    position: sticky;
    top: calc(var(--euiFixedHeadersOffset, 96px) + ${euiTheme.size.l});
    align-self: flex-start;
  `;

  const handleComponentClick = (
    componentId: string,
    componentType: OTelComponentType,
    pipelineId?: string
  ) => {
    if (
      selectedComponent?.componentId === componentId &&
      selectedComponent?.componentType === componentType
    ) {
      setSelectedComponent(null);
    } else {
      setSelectedComponent({ componentId, componentType, pipelineId });
    }
  };

  const agentName =
    typeof agent.local_metadata?.host === 'object' &&
    typeof agent.local_metadata.host.hostname === 'string'
      ? agent.local_metadata.host.hostname
      : agent.id;

  return (
    <>
      <EuiTabs
        css={css`
          margin-top: -${euiTheme.size.s};
        `}
        data-test-subj="collectorDetailTabs"
      >
        {DETAIL_TABS.map((tab) => (
          <EuiTab
            key={tab.id}
            isSelected={tab.id === selectedTabId}
            onClick={() => {
              setSelectedTabId(tab.id);
              setSelectedComponent(null);
            }}
            data-test-subj={`collectorDetailTab-${tab.id}`}
          >
            {tab.name}
          </EuiTab>
        ))}
      </EuiTabs>
      <EuiSpacer size="m" />
      <EuiFlexGroup gutterSize="m" responsive={false} alignItems="flexStart">
        <EuiFlexItem>
          {selectedTabId === 'health' && (
            <CollectorDetailHealth
              health={health}
              config={config}
              agentStatus={agent.status}
              onComponentClick={handleComponentClick}
              selectedComponentId={selectedComponent?.componentId}
            />
          )}
          {selectedTabId === 'info' && <CollectorDetailInfo agent={agent} config={config} />}
          {selectedTabId === 'yaml' &&
            (isConfigLoading ? (
              <EuiLoadingSpinner />
            ) : (
              <YamlViewer config={config} agentName={agentName} />
            ))}
        </EuiFlexItem>
        {selectedComponent && selectedTabId === 'health' && (
          <EuiFlexItem css={stickyDetailStyles}>
            <OTelComponentDetail
              componentId={selectedComponent.componentId}
              componentType={selectedComponent.componentType}
              pipelineId={selectedComponent.pipelineId}
              config={config}
              health={health}
              onClose={() => setSelectedComponent(null)}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </>
  );
};

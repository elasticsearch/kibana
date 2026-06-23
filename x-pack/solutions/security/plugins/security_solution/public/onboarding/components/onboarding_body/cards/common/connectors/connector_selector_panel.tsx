/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useEffect, useCallback } from 'react';
import { EuiCard, EuiFlexGroup, EuiFlexItem, EuiIcon, EuiText, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { ConnectorSelector } from '@kbn/security-solution-connectors';
import { isElasticManagedLlmConnector } from '@kbn/elastic-assistant/impl/connectorland/helpers';
import { useKibana } from '../../../../../../common/lib/kibana/kibana_react';
import type { AIConnector } from './types';
import * as i18n from './translations';

interface ConnectorSelectorPanelProps {
  connectors: AIConnector[];
  selectedConnectorId?: string;
  onConnectorSelected: (connector: AIConnector) => void;
}

export const ConnectorSelectorPanel = React.memo<ConnectorSelectorPanelProps>(
  ({ connectors, selectedConnectorId, onConnectorSelected }) => {
    const {
      triggersActionsUi: { actionTypeRegistry },
      settings,
    } = useKibana().services;
    const { euiTheme } = useEuiTheme();
    const selectedConnector = useMemo(
      () => connectors.find((connector) => connector.id === selectedConnectorId),
      [connectors, selectedConnectorId]
    );

    useEffect(() => {
      if (selectedConnectorId || !connectors.length) {
        return;
      }
      const inferenceConnector = connectors.find(
        ({ actionTypeId }) => actionTypeId === '.inference'
      );
      if (inferenceConnector) {
        onConnectorSelected(inferenceConnector);
      } else if (connectors.length === 1) {
        onConnectorSelected(connectors[0]);
      }
    }, [selectedConnectorId, connectors, onConnectorSelected]);

    const onConnectorSelectionChange = useCallback(
      (connectorId: string) => {
        const connector = connectors.find((c) => c.id === connectorId);
        if (connector) {
          onConnectorSelected(connector);
        }
      },
      [connectors, onConnectorSelected]
    );

    const betaBadgeProps = useMemo(() => {
      if (!selectedConnector || !isElasticManagedLlmConnector(selectedConnector)) {
        return;
      }

      return {
        label: (
          <span
            data-test-subj="connectorSelectorPanelBetaBadge"
            css={css`
              font-size: ${euiTheme.size.s};
              font-weight: ${euiTheme.font.weight.bold};
              line-height: ${euiTheme.base * 1.25}px;
              vertical-align: top;
            `}
          >
            {i18n.PRECONFIGURED_CONNECTOR_LABEL}
          </span>
        ),
        title: i18n.PRECONFIGURED_CONNECTOR_LABEL,
        color: 'subdued' as const,
        css: css`
          height: ${euiTheme.base * 1.25}px;
        `,
      };
    }, [euiTheme, selectedConnector]);

    return (
      <EuiCard
        css={css`
          height: 100%;
        `}
        hasBorder
        betaBadgeProps={betaBadgeProps}
        titleElement="p"
        title={
          <EuiFlexGroup
            alignItems="center"
            justifyContent="center"
            direction="column"
            gutterSize={selectedConnector ? 'xl' : 'l'}
          >
            <EuiFlexItem grow={false} justifyContent="center">
              <EuiText>{i18n.SELECTED_PROVIDER}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem justifyContent="center">
              <EuiFlexGroup
                alignItems="center"
                css={css`
                  height: ${euiTheme.size.xl};
                `}
                direction="column"
                justifyContent="center"
                responsive={false}
                gutterSize="xs"
              >
                {selectedConnector && (
                  <EuiFlexItem grow={false}>
                    <EuiIcon
                      size="xxl"
                      color="text"
                      type={actionTypeRegistry.get(selectedConnector.actionTypeId).iconClass}
                      aria-hidden={true}
                    />
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <ConnectorSelector
                    connectors={connectors}
                    selectedId={selectedConnectorId}
                    onChange={onConnectorSelectionChange}
                    settings={settings}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
        }
      />
    );
  }
);
ConnectorSelectorPanel.displayName = 'ConnectorSelectorPanel';

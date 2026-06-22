/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { EuiPopover, EuiButtonEmpty, EuiLoadingSpinner, type UseEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import {
  ConnectorSelectable,
  type ConnectorSelectableComponentProps,
} from '@kbn/ai-assistant-connector-selector-action';
import { useLoadConnectors } from '@kbn/inference-connectors';
import { STACK_CONNECTORS_MANAGEMENT_ID } from '../../../../common';
import { useKibana } from '../../hooks/use_kibana';
import { useNavigateToApp } from '../../hooks/use_navigate_to_app';

const labels = {
  selectConnector: i18n.translate('xpack.workplaceai.connectorSelector.selectConnector', {
    defaultMessage: 'Select connector',
  }),
  noConnector: i18n.translate('xpack.workplaceai.connectorSelector.noConnector', {
    defaultMessage: 'No connector',
  }),
};

const panelStyles = ({ euiTheme }: UseEuiTheme) => ({
  inlineSize: `calc(${euiTheme.size.xxl} * 8)`,
});

interface ConnectorSelectorProps {
  selectedConnectorId?: string;
  onSelectConnector: (connectorId: string) => void;
  defaultConnectorId?: string;
}

export const ConnectorSelector: React.FC<ConnectorSelectorProps> = ({
  selectedConnectorId,
  onSelectConnector,
  defaultConnectorId,
}) => {
  const navigateToApp = useNavigateToApp();
  const {
    services: { http },
  } = useKibana();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const { data: dataConnectors, isLoading } = useLoadConnectors({
    http,
    featureId: 'workplace_ai',
  });

  const connectors = useMemo(() => dataConnectors ?? [], [dataConnectors]);

  const togglePopover = () => setIsPopoverOpen(!isPopoverOpen);
  const closePopover = () => setIsPopoverOpen(false);

  const { preConfiguredConnectors, customConnectors } = useMemo(() => {
    const preConfigured: ConnectorSelectableComponentProps['preConfiguredConnectors'] = [];
    const custom: ConnectorSelectableComponentProps['customConnectors'] = [];

    connectors.forEach((connector) => {
      const option = {
        value: connector.id,
        label: connector.name,
      };

      if (connector.isPreconfigured) {
        preConfigured.push(option);
      } else {
        custom.push(option);
      }
    });

    return { preConfiguredConnectors: preConfigured, customConnectors: custom };
  }, [connectors]);

  // Auto-select first connector if none selected
  useEffect(() => {
    if (!isLoading && connectors.length > 0 && !selectedConnectorId) {
      const firstConnector = defaultConnectorId || connectors[0].id;
      if (firstConnector) {
        onSelectConnector(firstConnector);
      }
    }
  }, [isLoading, connectors, selectedConnectorId, defaultConnectorId, onSelectConnector]);

  const selectedConnector = connectors.find((c) => c.id === selectedConnectorId);
  const selectedConnectorName = selectedConnector?.name || selectedConnectorId;
  const buttonLabel = selectedConnectorName || labels.noConnector;

  const connectorSelectorButton = (
    <EuiButtonEmpty
      iconType={isLoading ? undefined : 'chevronSingleDown'}
      iconSide="right"
      flush="both"
      onClick={togglePopover}
      disabled={isLoading || connectors.length === 0}
      data-test-subj="workplaceAIConnectorSelectorButton"
      aria-haspopup="menu"
      aria-label={labels.selectConnector}
    >
      {isLoading ? <EuiLoadingSpinner size="s" /> : buttonLabel}
    </EuiButtonEmpty>
  );

  return (
    <EuiPopover
      panelProps={{ css: panelStyles }}
      button={connectorSelectorButton}
      isOpen={isPopoverOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="upLeft"
    >
      <ConnectorSelectable
        value={selectedConnectorId}
        onValueChange={(connectorId) => {
          onSelectConnector(connectorId);
          closePopover();
        }}
        customConnectors={customConnectors}
        preConfiguredConnectors={preConfiguredConnectors}
        defaultConnectorId={defaultConnectorId}
        data-test-subj="workplaceAIConnectorSelector"
        onAddConnectorClick={() => {
          navigateToApp(STACK_CONNECTORS_MANAGEMENT_ID);
          closePopover();
        }}
      />
    </EuiPopover>
  );
};

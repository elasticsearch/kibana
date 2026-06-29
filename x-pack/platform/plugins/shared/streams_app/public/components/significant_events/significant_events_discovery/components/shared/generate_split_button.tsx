/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InferenceConnector } from '@kbn/inference-common';
import React, { useCallback, useMemo } from 'react';
import {
  CONNECTOR_LOAD_ERROR,
  GENERATE_BUTTON_LABEL,
  GENERATE_FEATURES_BUTTON_LABEL,
  GENERATE_FEATURES_TOOLTIP,
  GENERATE_QUERIES_BUTTON_LABEL,
  GENERATE_QUERIES_TOOLTIP,
  GENERATE_CONFIG_ARIA_LABEL,
} from './translations';
import { buildConnectorMenuItem, buildConnectorSelectionPanel } from './context_menu_helpers';
import type { OnboardingConfig } from './types';
import { ContextMenuSplitButton } from './context_menu_split_button';
import type { ContextMenuSplitButtonProps, MenuHelpers } from './context_menu_split_button';

interface GenerateSplitButtonProps {
  config: OnboardingConfig;
  allConnectors: InferenceConnector[];
  connectorError: Error | undefined;
  featuresResolvedConnectorId: string | undefined;
  queriesResolvedConnectorId: string | undefined;
  onConfigChange: (config: OnboardingConfig) => void;
  onRun: () => void;
  onRunFeaturesOnly: () => void;
  onRunQueriesOnly: () => void;
  isRunDisabled: boolean;
  isConfigDisabled: boolean;
  isLoading?: boolean;
  size?: ContextMenuSplitButtonProps['size'];
}

export const GenerateSplitButton = ({
  config,
  allConnectors,
  connectorError,
  featuresResolvedConnectorId,
  queriesResolvedConnectorId,
  onConfigChange,
  onRun,
  onRunFeaturesOnly,
  onRunQueriesOnly,
  isRunDisabled,
  isConfigDisabled,
  isLoading,
  size,
}: GenerateSplitButtonProps) => {
  const featuresConnector = useMemo(
    () => allConnectors.find((c) => c.connectorId === config.connectors.features),
    [allConnectors, config.connectors.features]
  );
  const queriesConnector = useMemo(
    () => allConnectors.find((c) => c.connectorId === config.connectors.queries),
    [allConnectors, config.connectors.queries]
  );

  const onSelectFeaturesConnector = useCallback(
    (connectorId: string) => {
      onConfigChange({
        ...config,
        connectors: { ...config.connectors, features: connectorId },
      });
    },
    [config, onConfigChange]
  );

  const onSelectQueriesConnector = useCallback(
    (connectorId: string) => {
      onConfigChange({
        ...config,
        connectors: { ...config.connectors, queries: connectorId },
      });
    },
    [config, onConfigChange]
  );

  const buildPanels = useCallback(
    ({ resetMenu, closeMenu }: MenuHelpers) => [
      {
        items: [
          {
            name: GENERATE_FEATURES_BUTTON_LABEL,
            onClick: () => {
              closeMenu();
              onRunFeaturesOnly();
            },
            disabled: isRunDisabled,
            toolTipContent: GENERATE_FEATURES_TOOLTIP,
            toolTipProps: { position: 'right' as const },
          },
          buildConnectorMenuItem({ connector: featuresConnector, panelId: 1 }),
          { isSeparator: true as const },
          {
            name: GENERATE_QUERIES_BUTTON_LABEL,
            onClick: () => {
              closeMenu();
              onRunQueriesOnly();
            },
            disabled: isRunDisabled,
            toolTipContent: GENERATE_QUERIES_TOOLTIP,
            toolTipProps: { position: 'right' as const },
          },
          buildConnectorMenuItem({ connector: queriesConnector, panelId: 2 }),
        ],
      },
      buildConnectorSelectionPanel({
        connectors: allConnectors,
        resolvedConnectorId: featuresResolvedConnectorId,
        selectedConnectorId: config.connectors.features,
        onSelect: (connectorId) => {
          onSelectFeaturesConnector(connectorId);
          resetMenu();
        },
      }),
      buildConnectorSelectionPanel({
        connectors: allConnectors,
        resolvedConnectorId: queriesResolvedConnectorId,
        selectedConnectorId: config.connectors.queries,
        onSelect: (connectorId) => {
          onSelectQueriesConnector(connectorId);
          resetMenu();
        },
      }),
    ],
    [
      isRunDisabled,
      featuresConnector,
      queriesConnector,
      allConnectors,
      featuresResolvedConnectorId,
      queriesResolvedConnectorId,
      config.connectors.features,
      config.connectors.queries,
      onSelectFeaturesConnector,
      onSelectQueriesConnector,
      onRunFeaturesOnly,
      onRunQueriesOnly,
    ]
  );

  return (
    <ContextMenuSplitButton
      size={size}
      primaryLabel={GENERATE_BUTTON_LABEL}
      primaryIconType="radar"
      onPrimaryClick={onRun}
      isPrimaryDisabled={isRunDisabled}
      primaryDataTestSubj="significant_events_onboard_streams_button"
      secondaryAriaLabel={GENERATE_CONFIG_ARIA_LABEL}
      isSecondaryDisabled={isConfigDisabled}
      secondaryDataTestSubj="significant_events_onboarding_config_trigger"
      buildPanels={buildPanels}
      error={connectorError}
      errorTitle={CONNECTOR_LOAD_ERROR}
      isLoading={isLoading}
      data-test-subj="significant_events_generate_split_button"
    />
  );
};

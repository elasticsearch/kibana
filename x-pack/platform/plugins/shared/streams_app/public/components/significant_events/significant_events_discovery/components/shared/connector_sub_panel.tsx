/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiBadge, EuiSelectable } from '@elastic/eui';
import type { EuiSelectableOption } from '@elastic/eui';
import type { InferenceConnector } from '@kbn/inference-common';
import React, { useCallback, useMemo } from 'react';
import { ConnectorIcon } from '../../../../connector_list_button/connector_icon';
import { DEFAULT_MODEL_BADGE_LABEL } from './translations';

interface ConnectorSubPanelProps {
  connectors: InferenceConnector[];
  resolvedConnectorId: string | undefined;
  selectedConnectorId: string | undefined;
  onSelect: (connectorId: string) => void;
}

export const ConnectorSubPanel = ({
  connectors,
  resolvedConnectorId,
  selectedConnectorId,
  onSelect,
}: ConnectorSubPanelProps) => {
  const options = useMemo<EuiSelectableOption[]>(
    () =>
      connectors.map((connector) => ({
        label: connector.name,
        key: connector.connectorId,
        checked: connector.connectorId === selectedConnectorId ? ('on' as const) : undefined,
        prepend: <ConnectorIcon connectorName={connector.name} />,
        append:
          connector.connectorId === resolvedConnectorId ? (
            <EuiBadge color="hollow">{DEFAULT_MODEL_BADGE_LABEL}</EuiBadge>
          ) : undefined,
      })),
    [connectors, selectedConnectorId, resolvedConnectorId]
  );

  const handleChange = useCallback(
    (newOptions: EuiSelectableOption[]) => {
      const selected = newOptions.find((o) => o.checked === 'on');
      if (selected?.key) onSelect(selected.key);
    },
    [onSelect]
  );

  return (
    <EuiSelectable singleSelection="always" options={options} onChange={handleChange}>
      {(list) => list}
    </EuiSelectable>
  );
};

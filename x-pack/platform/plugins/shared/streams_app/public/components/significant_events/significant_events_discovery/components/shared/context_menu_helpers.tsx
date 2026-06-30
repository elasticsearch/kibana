/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { InferenceConnector } from '@kbn/inference-common';
import React from 'react';
import { ConnectorIcon } from '../../../../connector_list_button/connector_icon';
import { ConnectorSubPanel } from './connector_sub_panel';
import { MODEL_SELECTION_PANEL_TITLE } from './translations';

export function buildConnectorSelectionPanel({
  connectors,
  resolvedConnectorId,
  selectedConnectorId,
  onSelect,
}: {
  connectors: InferenceConnector[];
  resolvedConnectorId: string | undefined;
  selectedConnectorId: string | undefined;
  onSelect: (connectorId: string) => void;
}) {
  return {
    title: MODEL_SELECTION_PANEL_TITLE,
    width: 300,
    content: (
      <ConnectorSubPanel
        connectors={connectors}
        resolvedConnectorId={resolvedConnectorId}
        selectedConnectorId={selectedConnectorId}
        onSelect={onSelect}
      />
    ),
  };
}

export function buildConnectorMenuItem({
  connector,
  panelId,
}: {
  connector: InferenceConnector | undefined;
  panelId: number;
}): { name: React.ReactNode; panel: number } {
  return {
    name: (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <ConnectorIcon connectorName={connector?.name} />
        </EuiFlexItem>
        <EuiFlexItem className="eui-textTruncate" css={{ minWidth: 0 }}>
          {connector?.name ?? '—'}
        </EuiFlexItem>
      </EuiFlexGroup>
    ),
    panel: panelId,
  };
}

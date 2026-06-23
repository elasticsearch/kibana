/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiFlexGroup, EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/react';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import React from 'react';
import type { ConnectorItem } from '../../../../../common/http_api/tools';
import { useConnectorsActions } from '../../../context/connectors_provider';
import { labels } from '../../../utils/i18n';

export interface ConnectorQuickActionsProps {
  connector: ConnectorItem;
}

export const connectorQuickActionsHoverStyles = css`
  .euiTableRow:hover .connector-quick-actions {
    visibility: visible;
  }
`;

export const ConnectorQuickActions = ({ connector }: ConnectorQuickActionsProps) => {
  const { deleteConnector } = useConnectorsActions();

  return (
    <EuiFlexGroup
      css={css`
        visibility: hidden;
      `}
      className="connector-quick-actions"
      gutterSize="s"
      justifyContent="flexEnd"
      alignItems="center"
      component="span"
    >
      <EuiToolTip content={labels.connectors.deleteConnectorButtonLabel} disableScreenReaderOutput>
        <EuiButtonIcon
          data-test-subj="agentBuilderConnectorsRowDeleteButton"
          iconType="trash"
          color="danger"
          onClick={() => deleteConnector(connector)}
          aria-label={labels.connectors.deleteConnectorButtonLabel}
          {...getEbtProps({
            element: AGENT_BUILDER_UI_EBT.element.pageContent,
            action: AGENT_BUILDER_UI_EBT.action.connectors.DELETE_CONNECTOR,
          })}
        />
      </EuiToolTip>
    </EuiFlexGroup>
  );
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiPopoverFooter,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiIcon,
  EuiButtonIcon,
  EuiToolTip,
} from '@elastic/eui';
import React from 'react';
import { translations as i8n } from './connector_selector.translations';

export interface ConnectorSelectableFooterProps {
  /** Callback when the "Add Connector" button is clicked */
  onAddConnectorClick?: () => void;
  /** Callback when the "Manage Connectors" button is clicked */
  onManageConnectorsClick?: () => void;
}

export const ConnectorSelectableFooter: React.FC<ConnectorSelectableFooterProps> = (props) => {
  if (!props.onAddConnectorClick && !props.onManageConnectorsClick) {
    return null;
  }

  return (
    <EuiPopoverFooter paddingSize="s">
      <EuiFlexGroup alignItems="center" gutterSize="s" justifyContent="flexEnd">
        {props.onAddConnectorClick && (
          <EuiFlexItem grow={true}>
            <EuiButton
              size="s"
              fullWidth
              onClick={props.onAddConnectorClick}
              aria-label={i8n.addConnectorAriaLabel}
              data-test-subj="aiAssistantAddConnectorButton"
            >
              <EuiIcon type="plus" aria-hidden={true} />
              {i8n.addConnectorLabel}
            </EuiButton>
          </EuiFlexItem>
        )}
        {props.onManageConnectorsClick && (
          <EuiFlexItem grow={false}>
            <EuiToolTip content={i8n.manageConnectorAriaLabel} disableScreenReaderOutput>
              <EuiButtonIcon
                data-test-subj="aiAssistantManageConnectorsButton"
                size="s"
                display="base"
                iconType={'gear'}
                onClick={props.onManageConnectorsClick}
                aria-label={i8n.manageConnectorAriaLabel}
              />
            </EuiToolTip>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    </EuiPopoverFooter>
  );
};

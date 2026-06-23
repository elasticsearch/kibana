/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { type ActionConnector } from '@kbn/triggers-actions-ui-plugin/public/common/constants';
import { EuiFlexGroup, EuiFlexItem, EuiIcon, EuiPanel, EuiButton } from '@elastic/eui';
import { css } from '@emotion/css';
import type { ActionType } from '@kbn/actions-plugin/common';
import { AddConnectorModal } from '@kbn/elastic-assistant/impl/connectorland/add_connector_modal';
import * as i18n from './translations';
import { useKibana } from '../../../../../../common/lib/kibana';

interface ConnectorSetupProps {
  actionTypes: ActionType[];
  onConnectorSaved: (savedAction: ActionConnector) => void;
}
export const ConnectorSetup = React.memo<ConnectorSetupProps>(
  ({ onConnectorSaved, actionTypes }) => {
    const [isModalVisible, setIsModalVisible] = useState<boolean>(false);
    const [selectedActionType, setSelectedActionType] = useState<ActionType | null>(null);

    const { actionTypeRegistry } = useKibana().services.triggersActionsUi;

    const onModalClose = useCallback(() => {
      setSelectedActionType(null);
      setIsModalVisible(false);
    }, []);

    return (
      <>
        <EuiPanel hasShadow={false} hasBorder>
          <EuiFlexGroup
            css={{ height: '100%' }}
            direction="column"
            justifyContent="center"
            alignItems="center"
            gutterSize="m"
          >
            <EuiFlexItem grow={false}>
              <EuiFlexGroup direction="row" justifyContent="center">
                {actionTypes.map((actionType: ActionType) => (
                  <EuiFlexItem grow={false} key={actionType.id}>
                    <EuiFlexGroup
                      direction="column"
                      alignItems="center"
                      justifyContent="center"
                      gutterSize="s"
                      className={css`
                        height: 100%;
                      `}
                    >
                      <EuiFlexItem grow={false}>
                        <EuiIcon
                          size="xxl"
                          color="text"
                          type={actionTypeRegistry.get(actionType.id).iconClass}
                          aria-hidden={true}
                        />
                      </EuiFlexItem>
                    </EuiFlexGroup>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                data-test-subj="createConnectorButton"
                iconType="plusCircle"
                iconSide="left"
                onClick={() => setIsModalVisible(true)}
                isLoading={false}
              >
                {i18n.CREATE_NEW_CONNECTOR_BUTTON}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
        {isModalVisible && (
          <AddConnectorModal
            actionTypeRegistry={actionTypeRegistry}
            actionTypes={actionTypes}
            onClose={onModalClose}
            onSaveConnector={onConnectorSaved}
            onSelectActionType={setSelectedActionType}
            selectedActionType={selectedActionType}
          />
        )}
      </>
    );
  }
);
ConnectorSetup.displayName = 'ConnectorSetup';

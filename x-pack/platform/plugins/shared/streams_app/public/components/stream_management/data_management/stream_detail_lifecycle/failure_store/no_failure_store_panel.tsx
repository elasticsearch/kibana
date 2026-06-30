/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiPanel, EuiText } from '@elastic/eui';
import type { Streams } from '@kbn/streams-schema';

export const NoFailureStorePanel = ({
  onEnableFailureStore,
  definition,
  isExternalFlyoutOpen = false,
}: {
  onEnableFailureStore: () => void;
  definition: Streams.ingest.all.GetResponse;
  isExternalFlyoutOpen?: boolean;
}) => {
  const manageFailureStorePrivilege = definition.privileges?.manage_failure_store ?? false;
  return (
    <EuiPanel
      paddingSize="m"
      hasShadow={false}
      color="subdued"
      grow={false}
      data-test-subj="disabledFailureStorePanel"
    >
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem>
          <EuiText>
            <b>
              {i18n.translate('xpack.streams.streamDetailView.failureStoreDisabled.title', {
                defaultMessage: 'Failure store disabled',
              })}
            </b>
          </EuiText>
          <EuiText color="subdued">
            {i18n.translate('xpack.streams.streamDetailView.failureStoreDisabled.description', {
              defaultMessage:
                "Enable the failure store to collect this stream's failed documents for later review.",
            })}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {manageFailureStorePrivilege && (
            <div>
              <EuiButton
                type="button"
                onClick={onEnableFailureStore}
                data-test-subj="streamsAppFailureStoreEnableButton"
                disabled={isExternalFlyoutOpen}
              >
                {i18n.translate('xpack.streams.streamDetailView.failureStoreDisabled.button', {
                  defaultMessage: 'Enable failure store',
                })}
              </EuiButton>
            </div>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

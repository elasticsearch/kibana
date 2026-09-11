/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCard,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiSplitPanel,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { KbnDangerCallout } from '@kbn/ui-callout';
import {
  RELAY_APP_CONNECTION_STATUS,
  type RelayAppConnectionStatus,
} from '@kbn/significant-events-plugin/common';
import { useRelayAppConnection } from './use_relay_app_connection';
import { SlackConnectionBindings } from './slack_connection_bindings';

interface AppsSectionProps {
  canEdit: boolean;
}

/**
 * "Apps" section under Significant Events settings. Surfaces the Elastic
 * Slack App connect/disconnect flow for a single workspace.
 * Only rendered by the caller (`tab.tsx`) when the
 * `streams.significantEventsAppsEnabled` feature flag is on; additionally
 * renders nothing here when the Slack App is not available on this deployment
 * (`xpack.actions.relay` unset, or Agent Builder absent).
 */
export function AppsSection({ canEdit }: AppsSectionProps) {
  const { isLoading, available, status, error, isMutating, connect, disconnect } =
    useRelayAppConnection();

  if (isLoading || !available) {
    return null;
  }

  return (
    <>
      <EuiSpacer />
      <EuiSplitPanel.Outer hasBorder hasShadow={false} css={{ flexShrink: 0 }}>
        <EuiSplitPanel.Inner color="subdued">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.significantEventsApp.settings.apps.sectionTitle', {
                defaultMessage: 'Apps',
              })}
            </h3>
          </EuiTitle>
        </EuiSplitPanel.Inner>
        <EuiSplitPanel.Inner>
          <EuiFlexGroup gutterSize="l" wrap>
            <EuiFlexItem grow={false} css={{ minWidth: 320, maxWidth: 600 }}>
              <EuiCard
                display="subdued"
                textAlign="left"
                icon={<EuiIcon type="logoSlack" size="xl" aria-hidden={true} />}
                data-test-subj="streamsSlackAppCard"
                title={i18n.translate(
                  'xpack.significantEventsApp.settings.apps.slackWorkspaceTitle',
                  { defaultMessage: 'Elastic Slack App' }
                )}
                description={i18n.translate(
                  'xpack.significantEventsApp.settings.apps.slackCardDescription',
                  {
                    defaultMessage:
                      'Send Significant Event notifications to Slack and invoke Elastic agents from a channel.',
                  }
                )}
                footer={
                  <SlackCardFooter
                    status={status}
                    error={error}
                    canEdit={canEdit}
                    isMutating={isMutating}
                    onConnect={connect}
                    onDisconnect={disconnect}
                  />
                }
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>
    </>
  );
}

interface SlackCardFooterProps {
  status: RelayAppConnectionStatus;
  error?: string;
  canEdit: boolean;
  isMutating: boolean;
  onConnect: () => void;
  onDisconnect: () => Promise<void>;
}

function SlackCardFooter({
  status,
  error,
  canEdit,
  isMutating,
  onConnect,
  onDisconnect,
}: SlackCardFooterProps) {
  const [showChannels, setShowChannels] = useState(false);

  if (status === RELAY_APP_CONNECTION_STATUS.oauthInProgress) {
    return (
      <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="s" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                {i18n.translate('xpack.significantEventsApp.settings.apps.slackAwaitingAuth', {
                  defaultMessage: 'Waiting for authorization…',
                })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            color="danger"
            onClick={onDisconnect}
            isDisabled={!canEdit || isMutating}
            data-test-subj="streamsSlackAppCancelButton"
          >
            {i18n.translate('xpack.significantEventsApp.settings.apps.slackCancel', {
              defaultMessage: 'Cancel',
            })}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  if (status === RELAY_APP_CONNECTION_STATUS.connected) {
    return (
      <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
        <EuiFlexItem grow={false} css={{ width: '100%' }}>
          <EuiFlexGroup
            responsive={false}
            alignItems="center"
            justifyContent="spaceBetween"
            gutterSize="s"
          >
            <EuiFlexItem grow={false}>
              <EuiFlexGroup responsive={false} alignItems="center" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiBadge color="success" iconType="check">
                    {i18n.translate('xpack.significantEventsApp.settings.apps.slackConnected', {
                      defaultMessage: 'Connected',
                    })}
                  </EuiBadge>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <DisconnectWorkspaceButton
                    canEdit={canEdit}
                    isMutating={isMutating}
                    onDisconnect={onDisconnect}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType={showChannels ? 'chevronSingleDown' : 'chevronSingleRight'}
                onClick={() => setShowChannels((value) => !value)}
                aria-expanded={showChannels}
                data-test-subj="streamsSlackAppToggleChannelsButton"
              >
                {showChannels
                  ? i18n.translate('xpack.significantEventsApp.settings.apps.slackHideChannels', {
                      defaultMessage: 'Hide channels',
                    })
                  : i18n.translate('xpack.significantEventsApp.settings.apps.slackShowChannels', {
                      defaultMessage: 'Show channels',
                    })}
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        {showChannels && (
          <EuiFlexItem grow={false} css={{ width: '100%' }}>
            <SlackConnectionBindings canEdit={canEdit} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
    );
  }

  // not_connected or error
  return (
    <EuiFlexGroup direction="column" gutterSize="s" alignItems="flexStart">
      {error && (
        <EuiFlexItem grow={false}>
          <KbnDangerCallout announceOnMount size="s" title={error} />
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        <EuiButton
          size="s"
          fill
          onClick={onConnect}
          isLoading={isMutating}
          isDisabled={!canEdit || isMutating}
          data-test-subj="streamsSlackAppConnectButton"
        >
          {i18n.translate('xpack.significantEventsApp.settings.apps.slackConnect', {
            defaultMessage: 'Connect Slack',
          })}
        </EuiButton>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

interface DisconnectWorkspaceButtonProps {
  canEdit: boolean;
  isMutating: boolean;
  onDisconnect: () => Promise<void>;
}

function DisconnectWorkspaceButton({
  canEdit,
  isMutating,
  onDisconnect,
}: DisconnectWorkspaceButtonProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const modalTitleId = useGeneratedHtmlId();

  return (
    <>
      <EuiButtonEmpty
        size="s"
        color="danger"
        onClick={() => setConfirmOpen(true)}
        isLoading={isMutating}
        isDisabled={!canEdit || isMutating}
        data-test-subj="streamsSlackAppDisconnectButton"
      >
        {i18n.translate('xpack.significantEventsApp.settings.apps.slackDisconnect', {
          defaultMessage: 'Disconnect workspace',
        })}
      </EuiButtonEmpty>
      {confirmOpen && (
        <EuiConfirmModal
          title={i18n.translate(
            'xpack.significantEventsApp.settings.apps.slackDisconnectConfirmTitle',
            { defaultMessage: 'Disconnect Slack App?' }
          )}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            // Failure is surfaced via a toast in useRelayAppConnection; swallow here so the
            // modal still closes without an unhandled rejection.
            void onDisconnect()
              .catch(() => undefined)
              .finally(() => setConfirmOpen(false));
          }}
          cancelButtonText={i18n.translate(
            'xpack.significantEventsApp.settings.apps.slackDisconnectConfirmCancel',
            { defaultMessage: 'Cancel' }
          )}
          confirmButtonText={i18n.translate(
            'xpack.significantEventsApp.settings.apps.slackDisconnectConfirmConfirm',
            { defaultMessage: 'Disconnect workspace' }
          )}
          buttonColor="danger"
          aria-labelledby={modalTitleId}
          titleProps={{ id: modalTitleId }}
          data-test-subj="streamsSlackAppDisconnectConfirmModal"
        >
          <EuiText size="s">
            {i18n.translate('xpack.significantEventsApp.settings.apps.slackDisconnectConfirmBody', {
              defaultMessage:
                'This removes all Slack channel connections for this deployment. You can reconnect later.',
            })}
          </EuiText>
        </EuiConfirmModal>
      )}
    </>
  );
}

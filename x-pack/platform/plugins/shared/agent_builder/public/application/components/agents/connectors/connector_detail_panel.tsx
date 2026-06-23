/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHealth,
  EuiLink,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useConnectorOAuthConnect, OAuthRedirectMode } from '@kbn/response-ops-oauth-hooks';
import type { ConnectorItem } from '../../../../../common/http_api/tools';
import { OAUTH_STATUS } from '../../../../../common/http_api/tools';
import { useKibana } from '../../../hooks/use_kibana';
import { useConnectorsActions } from '../../../context/connectors_provider';
import { labels } from '../../../utils/i18n';
import { useNavigation } from '../../../hooks/use_navigation';
import { appPaths } from '../../../utils/app_paths';
import { DetailPanelLayout } from '../common/detail_panel_layout';
import { ConnectorTypeIcon } from '../../connectors/connector_type_icon';
import { useConnectorUsedByAgents } from '../../../hooks/connectors/use_connector_used_by_agents';

interface ConnectorDetailPanelProps {
  connector: ConnectorItem;
  agentId: string;
  onRemove: (connector: ConnectorItem) => void;
  canEditAgent: boolean;
}

const SubActionsSection: React.FC<{ connector: ConnectorItem }> = ({ connector }) => {
  const { euiTheme } = useEuiTheme();
  const { subActions } = connector;

  // Not all agentBuilder-compatible connectors have a kbn-connector-spec (e.g. Tines, ServiceNow,
  // Swimlane register AgentBuilderConnectorFeatureId directly in stack_connectors without a spec).
  // For those, subActions is [] — render nothing rather than crash.
  if (subActions.length === 0) {
    return null;
  }

  return (
    <div>
      <EuiTitle size="xxs">
        <h3>{labels.agentConnectors.subActionsSectionTitle(subActions.length)}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <ul
        css={css`
          margin: 0;
          padding-left: ${euiTheme.size.m};
        `}
      >
        {subActions.map((subAction) => (
          <li key={subAction.name}>
            <EuiText size="s">
              <strong>{subAction.name}</strong>
            </EuiText>
            {subAction.description && (
              <EuiText size="xs" color="subdued">
                {subAction.description}
              </EuiText>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

const ConnectionSection: React.FC<{ connector: ConnectorItem }> = ({ connector }) => {
  const {
    services: {
      notifications: { toasts },
    },
  } = useKibana();
  const { invalidateConnectors } = useConnectorsActions();

  const { connect: reauthenticate } = useConnectorOAuthConnect({
    connectorId: connector.id,
    redirectMode: OAuthRedirectMode.NewTab,
    onSuccess: () => {
      toasts.addSuccess({
        title: labels.connectors.oauthConnectSuccessTitle,
        text: labels.connectors.oauthConnectSuccessMessage,
      });
      invalidateConnectors();
    },
    onError: (error) => {
      toasts.addDanger({
        title: labels.connectors.oauthConnectErrorTitle,
        text: error.message,
      });
    },
  });

  const isOAuth = connector.authMode === 'per-user';
  const isOAuthConnected = isOAuth && connector.oauthStatus === OAUTH_STATUS.AUTHORIZED;
  const isOAuthDisconnected = isOAuth && connector.oauthStatus === OAUTH_STATUS.DISCONNECTED;

  let statusColor: 'success' | 'warning' | 'danger';
  let statusText: string;

  // isMissingSecrets reflects missing system-level connector secrets (e.g. service account
  // credentials), which is orthogonal to per-user OAuth status. We surface this first because
  // a connector with missing system secrets is broken regardless of individual OAuth state.
  if (connector.isMissingSecrets) {
    statusColor = 'danger';
    statusText = labels.agentConnectors.missingSecretsStatus;
  } else if (isOAuthDisconnected) {
    statusColor = 'warning';
    statusText = labels.agentConnectors.oauthDisconnectedStatus;
  } else if (isOAuthConnected) {
    statusColor = 'success';
    statusText = labels.agentConnectors.oauthConnectedStatus;
  } else {
    // authMode === 'shared' or undefined (e.g. API key auth) — credentials are shared
    // across all Kibana users of this connector, as opposed to per-user OAuth tokens.
    statusColor = 'success';
    statusText = labels.agentConnectors.sharedCredentialsStatus;
  }

  return (
    <div>
      <EuiTitle size="xxs">
        <h3>{labels.agentConnectors.connectionSectionTitle}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiHealth color={statusColor}>{statusText}</EuiHealth>
      {isOAuth && (
        <>
          <EuiSpacer size="s" />
          <EuiButton size="s" onClick={reauthenticate}>
            {isOAuthConnected
              ? labels.agentConnectors.reauthenticateLink
              : labels.agentConnectors.authenticateLink}
          </EuiButton>
        </>
      )}
    </div>
  );
};

const UsedBySection: React.FC<{ connector: ConnectorItem; agentId: string }> = ({
  connector,
  agentId,
}) => {
  const { createAgentBuilderUrl } = useNavigation();
  const { usedByAgents, isLoading, error } = useConnectorUsedByAgents({
    connectorId: connector.id,
    currentAgentId: agentId,
  });

  return (
    <div>
      <EuiTitle size="xxs">
        <h3>{labels.agentConnectors.usedBySectionTitle}</h3>
      </EuiTitle>
      <EuiSpacer size="s" />
      {isLoading ? (
        <EuiLoadingSpinner size="s" />
      ) : error ? (
        <EuiText size="s" color="subdued">
          {labels.agentConnectors.usedByLoadError}
        </EuiText>
      ) : usedByAgents.length === 0 ? (
        <EuiText size="s" color="subdued">
          {labels.agentConnectors.notUsedByOtherAgents}
        </EuiText>
      ) : (
        <EuiText size="s">
          {labels.agentConnectors.usedByAgentsMessage(usedByAgents.length)}
          {': '}
          {usedByAgents.map((agent, idx) => (
            <React.Fragment key={agent.id}>
              {idx > 0 && ', '}
              <EuiLink href={createAgentBuilderUrl(appPaths.agent.root({ agentId: agent.id }))}>
                {agent.name}
              </EuiLink>
            </React.Fragment>
          ))}
        </EuiText>
      )}
    </div>
  );
};

export const ConnectorDetailPanel: React.FC<ConnectorDetailPanelProps> = ({
  connector,
  agentId,
  onRemove,
  canEditAgent,
}) => {
  const { euiTheme } = useEuiTheme();
  const { actionTypeRegistry } = useKibana().services.plugins.triggersActionsUi;

  const actionType = actionTypeRegistry.has(connector.actionTypeId)
    ? actionTypeRegistry.get(connector.actionTypeId)
    : null;

  const typeName = actionType?.actionTypeTitle ?? connector.actionTypeId;
  const description = actionType?.selectMessage ?? null;

  return (
    <DetailPanelLayout
      isLoading={false}
      isEmpty={false}
      title={connector.name}
      headerContent={
        <EuiFlexGroup
          alignItems="center"
          gutterSize="s"
          responsive={false}
          css={css`
            margin-top: ${euiTheme.size.s};
          `}
        >
          <EuiFlexItem grow={false}>
            <ConnectorTypeIcon actionTypeId={connector.actionTypeId} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="s" color="subdued">
              {typeName}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      }
      headerActions={(openConfirmRemove) =>
        canEditAgent ? (
          <EuiButtonEmpty iconType="cross" size="xs" color="danger" onClick={openConfirmRemove}>
            {labels.agentConnectors.removeConnectorButtonLabel}
          </EuiButtonEmpty>
        ) : null
      }
      confirmRemove={{
        title: labels.agentConnectors.removeConnectorConfirmTitle(connector.name),
        body: labels.agentConnectors.removeConnectorConfirmBody,
        confirmButtonText: labels.agentConnectors.removeConnectorConfirmButton,
        cancelButtonText: labels.agentConnectors.removeConnectorCancelButton,
        onConfirm: () => onRemove(connector),
      }}
    >
      {description && (
        <>
          <EuiText size="s">{description}</EuiText>
          <EuiSpacer size="l" />
        </>
      )}

      <ConnectionSection connector={connector} />

      {connector.subActions.length > 0 && (
        <>
          <EuiSpacer size="l" />
          <SubActionsSection connector={connector} />
        </>
      )}

      <EuiSpacer size="l" />

      <UsedBySection connector={connector} agentId={agentId} />
    </DetailPanelLayout>
  );
};

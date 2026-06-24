/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiButton, EuiFlexGroup, EuiText } from '@elastic/eui';
import type { UseEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { AuthorizationPromptDefinition } from '@kbn/agent-builder-common/agents';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { formatAgentBuilderErrorMessage } from '@kbn/agent-builder-browser';
import { OAuthRedirectMode, useConnectorOAuthConnect } from '@kbn/response-ops-oauth-hooks';
import { promptContainerStyles } from './prompt_container.styles';
import { useToasts } from '../../../../hooks/use_toasts';
import { ConnectorTypeIcon } from '../../../connectors/connector_type_icon';

const labels = {
  deny: i18n.translate('xpack.agentBuilder.authorizationPrompt.deny', {
    defaultMessage: 'Deny',
  }),
  authorize: i18n.translate('xpack.agentBuilder.authorizationPrompt.authorize', {
    defaultMessage: 'Authorize',
  }),
  authorized: i18n.translate('xpack.agentBuilder.authorizationPrompt.authorized', {
    defaultMessage: 'Authorized',
  }),
  declined: i18n.translate('xpack.agentBuilder.authorizationPrompt.declined', {
    defaultMessage: 'Declined',
  }),
  errorToastTitle: i18n.translate('xpack.agentBuilder.authorizationPrompt.errorToastTitle', {
    defaultMessage: 'Authorization failed',
  }),
};

const titleStyles = ({ euiTheme }: UseEuiTheme) => css`
  font-weight: ${euiTheme.font.weight.semiBold};
`;

const descriptionStyles = ({ euiTheme }: UseEuiTheme) => css`
  margin-top: ${euiTheme.size.s};
`;

const buttonsRowStyles = ({ euiTheme }: UseEuiTheme) => css`
  margin-top: ${euiTheme.size.base};
`;

export interface AuthorizationPromptProps {
  prompt: AuthorizationPromptDefinition;
  onAuthorize: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  isAnswered?: boolean;
  answeredValue?: boolean;
}

export const AuthorizationPrompt = ({
  prompt,
  onAuthorize,
  onCancel,
  isLoading = false,
  isDisabled = false,
  isAnswered = false,
  answeredValue,
}: AuthorizationPromptProps) => {
  const { addErrorToast } = useToasts();

  const { connect, cancelConnect, isConnecting } = useConnectorOAuthConnect({
    connectorId: prompt.connector_id,
    redirectMode: OAuthRedirectMode.NewTab,
    onSuccess: onAuthorize,
    onError: (error) => {
      addErrorToast({
        title: labels.errorToastTitle,
        text: formatAgentBuilderErrorMessage(error),
      });
    },
  });

  const handleAuthorize = useCallback(() => {
    cancelConnect();
    connect();
  }, [cancelConnect, connect]);

  const handleCancel = useCallback(() => {
    cancelConnect();
    onCancel();
  }, [cancelConnect, onCancel]);

  const isInteractionDisabled = isDisabled || isLoading || isAnswered || isConnecting;

  return (
    <EuiFlexGroup
      direction="column"
      responsive={false}
      gutterSize="none"
      css={promptContainerStyles}
      data-test-subj="agentBuilderAuthorizationPrompt"
    >
      <EuiText component="span" css={titleStyles}>
        <FormattedMessage
          id="xpack.agentBuilder.authorizationPrompt.title"
          defaultMessage="Reauthorize {connectorIcon} {connectorName}?"
          values={{
            connectorIcon: <ConnectorTypeIcon actionTypeId={prompt.connector_type} size="s" />,
            connectorName: prompt.connector_name,
          }}
        />
      </EuiText>

      <EuiText component="p" size="s" color="subdued" css={descriptionStyles}>
        <FormattedMessage
          id="xpack.agentBuilder.authorizationPrompt.message"
          defaultMessage="The agent paused because it needs access to {connectorName} to continue."
          values={{
            connectorName: <strong>{prompt.connector_name}</strong>,
          }}
        />
      </EuiText>

      <EuiFlexGroup
        gutterSize="s"
        justifyContent="flexEnd"
        responsive={false}
        css={buttonsRowStyles}
      >
        <EuiButton
          onClick={handleCancel}
          disabled={isInteractionDisabled}
          size="s"
          iconType="cross"
          color={isAnswered && answeredValue === false ? 'danger' : 'text'}
          data-test-subj="agentBuilderAuthorizationPromptCancelButton"
          {...getEbtProps({
            element: AGENT_BUILDER_UI_EBT.element.pageContent,
            action: AGENT_BUILDER_UI_EBT.action.conversation.AUTH_PROMPT_CANCEL,
            detail: 'conversation',
          })}
        >
          {isAnswered && answeredValue === false ? labels.declined : labels.deny}
        </EuiButton>
        <EuiButton
          onClick={handleAuthorize}
          isLoading={isLoading || isConnecting}
          disabled={isInteractionDisabled}
          fill={!isAnswered || answeredValue === true}
          size="s"
          iconType="check"
          color={isAnswered && answeredValue === true ? 'success' : 'primary'}
          data-test-subj="agentBuilderAuthorizationPromptAuthorizeButton"
          {...getEbtProps({
            element: AGENT_BUILDER_UI_EBT.element.pageContent,
            action: AGENT_BUILDER_UI_EBT.action.conversation.AUTH_PROMPT_AUTHORIZE,
            detail: 'conversation',
          })}
        >
          {isAnswered && answeredValue === true ? labels.authorized : labels.authorize}
        </EuiButton>
      </EuiFlexGroup>
    </EuiFlexGroup>
  );
};

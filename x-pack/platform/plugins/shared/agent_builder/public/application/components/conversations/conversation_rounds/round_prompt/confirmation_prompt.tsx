/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButton, EuiFlexGroup, EuiFlexItem, EuiMarkdownFormat, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { ConfirmPromptDefinition } from '@kbn/agent-builder-common/agents';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { promptContainerStyles } from './prompt_container.styles';

const defaultLabels = {
  title: i18n.translate('xpack.agentBuilder.confirmationPrompt.defaultTitle', {
    defaultMessage: 'Confirmation required',
  }),
  message: i18n.translate('xpack.agentBuilder.confirmationPrompt.defaultMessage', {
    defaultMessage: 'Do you want to proceed with this action?',
  }),
  confirmText: i18n.translate('xpack.agentBuilder.confirmationPrompt.confirm', {
    defaultMessage: 'Approve',
  }),
  cancelText: i18n.translate('xpack.agentBuilder.confirmationPrompt.cancel', {
    defaultMessage: 'Deny',
  }),
};

export interface ConfirmationPromptProps {
  prompt: ConfirmPromptDefinition;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  isDisabled?: boolean;
  isAnswered?: boolean;
  answeredValue?: boolean;
}

export const ConfirmationPrompt: React.FC<ConfirmationPromptProps> = ({
  prompt,
  onConfirm,
  onCancel,
  isLoading = false,
  isDisabled = false,
  isAnswered = false,
  answeredValue,
}) => {
  const { euiTheme } = useEuiTheme();
  const color = prompt.color ?? 'primary';

  const title = prompt.title ?? defaultLabels.title;
  const confirmText = prompt.confirm_text ?? defaultLabels.confirmText;
  const cancelText = prompt.cancel_text ?? defaultLabels.cancelText;
  const body = prompt.message ?? defaultLabels.message;

  const headerStyles = css`
    padding-bottom: ${euiTheme.size.s};
  `;

  const titleStyles = css`
    font-weight: ${euiTheme.font.weight.semiBold};
    font-size: ${euiTheme.size.base};
    color: ${euiTheme.colors.textParagraph};
    p {
      margin-block: 0;
    }
  `;

  const footerStyles = css`
    margin-top: ${euiTheme.size.base};
  `;

  return (
    <EuiFlexGroup
      direction="column"
      responsive={false}
      css={promptContainerStyles}
      gutterSize="none"
      data-test-subj="agentBuilderConfirmationPrompt"
    >
      {/* Header */}
      <EuiFlexItem grow={false} css={headerStyles}>
        <EuiMarkdownFormat css={titleStyles}>{title}</EuiMarkdownFormat>
      </EuiFlexItem>

      {/* Body */}
      <EuiFlexItem grow={false}>
        <EuiMarkdownFormat
          textSize="s"
          css={css`
            color: ${euiTheme.colors.textSubdued};
          `}
        >
          {body}
        </EuiMarkdownFormat>
      </EuiFlexItem>

      {/* Action buttons */}
      <EuiFlexItem grow={false} css={footerStyles}>
        <EuiFlexGroup gutterSize="s" justifyContent="flexEnd" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={onCancel}
              disabled={isDisabled || isLoading || isAnswered}
              size="s"
              iconType="cross"
              color={isAnswered && answeredValue === false ? 'danger' : 'text'}
              data-test-subj="agentBuilderConfirmationPromptCancelButton"
              {...getEbtProps({
                element: AGENT_BUILDER_UI_EBT.element.pageContent,
                action: AGENT_BUILDER_UI_EBT.action.conversation.CONFIRM_PROMPT_CANCEL,
                detail: 'conversation',
              })}
            >
              {cancelText}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              onClick={onConfirm}
              isLoading={isLoading}
              disabled={isDisabled || isAnswered}
              fill={!isAnswered || answeredValue === true}
              size="s"
              iconType="check"
              color={isAnswered && answeredValue === true ? 'success' : color}
              data-test-subj="agentBuilderConfirmationPromptConfirmButton"
              {...getEbtProps({
                element: AGENT_BUILDER_UI_EBT.element.pageContent,
                action: AGENT_BUILDER_UI_EBT.action.conversation.CONFIRM_PROMPT_CONFIRM,
                detail: 'conversation',
              })}
            >
              {confirmText}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

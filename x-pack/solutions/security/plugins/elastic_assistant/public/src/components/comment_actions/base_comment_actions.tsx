/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiCopy, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import type { ClientMessage } from '@kbn/elastic-assistant';
import React from 'react';

import { removeContentReferences } from '@kbn/elastic-assistant-common';
import { i18n } from '@kbn/i18n';

export const COPY_TO_CLIPBOARD = i18n.translate(
  'xpack.elasticAssistantPlugin.assistant.commentActions.copyToClipboard',
  {
    defaultMessage: 'Copy to clipboard',
  }
);

interface Props {
  message: ClientMessage;
  children: React.ReactNode;
}

/**
 * Returns the content of the message compatible with a standard markdown renderer.
 *
 * Content references are removed as they can only be rendered by the assistant.
 */
function getSelfContainedContent(content: string): string {
  return removeContentReferences(content).trim();
}

const BaseCommentActionsComponent: React.FC<Props> = ({ message, children }) => {
  const content = message.content ?? '';

  return (
    <EuiFlexGroup alignItems="center" gutterSize="none">
      {children}
      <EuiFlexItem grow={false} data-test-subj="copy-to-clipboard-action">
        <EuiToolTip position="top" content={COPY_TO_CLIPBOARD}>
          <EuiCopy textToCopy={getSelfContainedContent(content)}>
            {(copy) => (
              <EuiToolTip content={COPY_TO_CLIPBOARD} disableScreenReaderOutput>
                <EuiButtonIcon
                  aria-label={COPY_TO_CLIPBOARD}
                  color="primary"
                  iconType="copy"
                  onClick={copy}
                />
              </EuiToolTip>
            )}
          </EuiCopy>
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

export const BaseCommentActions = React.memo(BaseCommentActionsComponent);

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiFlexGroup, EuiFlexItem, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { PromptResponseEvent } from '@kbn/agent-builder-common/chat/timeline_events';
import {
  isConfirmationPromptResponse,
  isAuthorizationPromptResponse,
  isAskUserQuestionPromptResponse,
} from '@kbn/agent-builder-common/agents';

const labels = {
  approved: i18n.translate('xpack.agentBuilder.conversation.timeline.promptResponse.approved', {
    defaultMessage: 'Approved',
  }),
  denied: i18n.translate('xpack.agentBuilder.conversation.timeline.promptResponse.denied', {
    defaultMessage: 'Denied',
  }),
  authorized: i18n.translate('xpack.agentBuilder.conversation.timeline.promptResponse.authorized', {
    defaultMessage: 'Authorized',
  }),
  declined: i18n.translate('xpack.agentBuilder.conversation.timeline.promptResponse.declined', {
    defaultMessage: 'Declined',
  }),
  responded: i18n.translate('xpack.agentBuilder.conversation.timeline.promptResponse.responded', {
    defaultMessage: 'Responded',
  }),
  skipped: i18n.translate('xpack.agentBuilder.conversation.timeline.promptResponse.skipped', {
    defaultMessage: 'Skipped',
  }),
};

/** Renders the human's read-only answer(s) to a HITL prompt. */
export const PromptResponse: React.FC<{ event: PromptResponseEvent }> = ({ event }) => {
  const responseEntries = Object.entries(event.data.responses);

  if (responseEntries.length === 0) {
    return null;
  }

  return (
    <EuiFlexGroup direction="column" gutterSize="s" data-test-subj="agentBuilderPromptResponse">
      {responseEntries.map(([promptId, response]) => {
        if (isConfirmationPromptResponse(response)) {
          return (
            <EuiFlexItem key={promptId} grow={false}>
              <div>
                <EuiBadge color={response.allow ? 'success' : 'danger'}>
                  {response.allow ? labels.approved : labels.denied}
                </EuiBadge>
              </div>
            </EuiFlexItem>
          );
        }

        if (isAuthorizationPromptResponse(response)) {
          return (
            <EuiFlexItem key={promptId} grow={false}>
              <div>
                <EuiBadge color={response.authorized ? 'success' : 'danger'}>
                  {response.authorized ? labels.authorized : labels.declined}
                </EuiBadge>
              </div>
            </EuiFlexItem>
          );
        }

        if (isAskUserQuestionPromptResponse(response)) {
          const answerTexts = response.answers.map((answer) => {
            if (answer.skipped) {
              return labels.skipped;
            }
            // custom free-text answer; choice indices have no label context available here
            return answer.custom ?? labels.responded;
          });

          return (
            <EuiFlexItem key={promptId} grow={false}>
              <EuiText size="s">
                {answerTexts.map((text, answerIndex) => (
                  <p key={answerIndex}>{text}</p>
                ))}
              </EuiText>
            </EuiFlexItem>
          );
        }

        return null;
      })}
    </EuiFlexGroup>
  );
};

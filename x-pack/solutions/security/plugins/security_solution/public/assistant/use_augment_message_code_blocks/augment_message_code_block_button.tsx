/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIcon } from '@elastic/eui';
import type { CodeBlockDetails, Conversation } from '@kbn/elastic-assistant';
import { DETECTION_RULES_CREATE_FORM_CONVERSATION_ID } from '../../detection_engine/rule_creation_ui/components/ai_assistant/translations';
import { sendToTimelineEligibleQueryTypes } from '../helpers';
import { SendToTimelineButton } from '../send_to_timeline';
import { UpdateQueryInFormButton } from '../update_query_in_form';

interface Props {
  currentConversation: Conversation;
  codeBlockDetails: CodeBlockDetails;
}

export const AugmentMessageCodeBlockButton = ({ currentConversation, codeBlockDetails }: Props) => {
  const sendToTimeline = sendToTimelineEligibleQueryTypes.includes(codeBlockDetails.type) && (
    <SendToTimelineButton
      asEmptyButton={true}
      dataProviders={[
        {
          id: 'assistant-data-provider',
          name: `Assistant Query from conversation ${currentConversation.id}`,
          enabled: true,
          excluded: false,
          queryType: codeBlockDetails.type,
          kqlQuery: codeBlockDetails.content ?? '',
          queryMatch: {
            field: 'host.name',
            operator: ':',
            value: 'test',
          },
          and: [],
        },
      ]}
      keepDataView={true}
    >
      <EuiIcon type="timeline" aria-hidden={true} />
    </SendToTimelineButton>
  );

  const updateQueryInForm = DETECTION_RULES_CREATE_FORM_CONVERSATION_ID ===
    currentConversation.title && <UpdateQueryInFormButton query={codeBlockDetails.content ?? ''} />;

  return (
    <>
      {sendToTimeline}
      {updateQueryInForm}
    </>
  );
};

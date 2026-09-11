/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiPanel,
  useEuiTheme,
  euiTextBreakWord,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useState } from 'react';
import type { ConversationRoundAuthor, ConversationRoundOrigin } from '@kbn/agent-builder-common';
import type {
  Attachment,
  AttachmentVersionRef,
  VersionedAttachment,
} from '@kbn/agent-builder-common/attachments';
import { AttachmentType, ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import { useRoundInputAuthor } from '../../../hooks/use_round_input_author';
import { RoundResponseActions } from './round_response/round_response_actions';
import { RoundAttachmentReferences } from './round_attachment_references';
import { RoundInputText } from './round_input_text';
import { RoundInputAvatar } from './round_input_avatar';
import { RoundAuthorHeader } from './round_author_header';
import { RoundInputImages } from './round_input_images';

const labels = {
  userMessage: i18n.translate('xpack.agentBuilder.round.userInput', {
    defaultMessage: 'User input',
  }),
};

interface RoundInputProps {
  input: string;
  author?: ConversationRoundAuthor;
  isPendingCurrentRound: boolean;
  origin?: ConversationRoundOrigin;
  startedAt: string;
  attachmentRefs?: AttachmentVersionRef[];
  conversationAttachments?: VersionedAttachment[];
  fallbackAttachments?: Attachment[];
}

const EXCLUDE_IMAGE_TYPES: AttachmentType[] = [AttachmentType.image];

export const RoundInput = ({
  input,
  author,
  isPendingCurrentRound,
  origin,
  startedAt,
  attachmentRefs,
  conversationAttachments,
  fallbackAttachments,
}: RoundInputProps) => {
  const { euiTheme } = useEuiTheme();
  const [isHovering, setIsHovering] = useState(false);
  const [hoveredImageName, setHoveredImageName] = useState<string | null>(null);
  const {
    profile: authorProfile,
    name: authorName,
    avatarName: authorAvatarName,
    isCurrentUser,
  } = useRoundInputAuthor({ author, origin, isPendingCurrentRound });

  const inputContainerStyles = css`
    width: 100%;
    background: ${isCurrentUser
      ? euiTheme.colors.backgroundLightPrimary
      : euiTheme.colors.backgroundLightText};
    ${euiTextBreakWord()}
    white-space: pre-wrap;
    border-radius: ${euiTheme.border.radius.small} ${euiTheme.size.base} ${euiTheme.size.base}
      ${euiTheme.size.base};
    padding: ${euiTheme.size.m} ${euiTheme.size.base};
  `;

  const inputContentStyles = css`
    inline-size: 100%;
  `;

  return (
    <EuiFlexGroup
      gutterSize="s"
      alignItems="flexStart"
      responsive={false}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      data-test-subj="agentBuilderRoundInputLayout"
    >
      <EuiFlexItem grow={false} data-test-subj="agentBuilderRoundInputAvatar">
        <RoundInputAvatar profile={authorProfile} name={authorAvatarName} />
      </EuiFlexItem>
      <EuiFlexItem
        grow={false}
        css={inputContentStyles}
        data-test-subj="agentBuilderRoundInputContent"
      >
        <EuiFlexGroup direction="column" gutterSize="xs">
          <EuiFlexItem grow={false}>
            <RoundAuthorHeader name={authorName} origin={origin} startedAt={startedAt} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPanel
              css={inputContainerStyles}
              hasShadow={false}
              hasBorder={false}
              aria-label={labels.userMessage}
            >
              <EuiFlexGroup direction="column" gutterSize="s">
                <RoundInputImages
                  attachmentRefs={attachmentRefs}
                  conversationAttachments={conversationAttachments}
                  fallbackAttachments={fallbackAttachments}
                  actorFilter={[ATTACHMENT_REF_ACTOR.user]}
                  hoveredImageName={hoveredImageName}
                />
                <EuiFlexItem grow={false}>
                  <EuiText size="s">
                    <RoundInputText text={input} onHoverImage={setHoveredImageName} />
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>
          <RoundAttachmentReferences
            attachmentRefs={attachmentRefs}
            conversationAttachments={conversationAttachments}
            fallbackAttachments={fallbackAttachments}
            actorFilter={[ATTACHMENT_REF_ACTOR.user]}
            justifyContent="flexStart"
            excludeTypes={EXCLUDE_IMAGE_TYPES}
          />
          <EuiFlexItem grow={false}>
            <RoundResponseActions content={input} isVisible={isHovering} copyTarget="prompt" />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

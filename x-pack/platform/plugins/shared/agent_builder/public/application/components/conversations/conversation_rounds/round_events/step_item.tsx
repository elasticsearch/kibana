/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ConversationRoundStep } from '@kbn/agent-builder-common/chat/conversation';
import {
  isReasoningStep,
  isToolCallStep,
  isCompactionStep,
  isBackgroundAgentCompleteStep,
  isAskUserQuestionStep,
} from '@kbn/agent-builder-common/chat/conversation';
import type {
  VersionedAttachment,
  AttachmentVersionRef,
} from '@kbn/agent-builder-common/attachments';
import { ReasoningStep } from './steps/reasoning_step';
import { ToolCallStep } from './steps/tool_call_step';
import { CompactionStep } from './steps/compaction_step';
import { BackgroundAgentStep } from './steps/background_agent_step';
import { AskUserQuestionStepEvent } from './steps/ask_user_question_step';

interface StepItemProps {
  step: ConversationRoundStep;
  steps: ConversationRoundStep[];
  conversationAttachments?: VersionedAttachment[];
  attachmentRefs?: AttachmentVersionRef[];
  conversationId?: string;
}

export const StepItem: React.FC<StepItemProps> = ({
  step,
  steps,
  conversationAttachments,
  attachmentRefs,
  conversationId,
}) => {
  if (isReasoningStep(step)) {
    if (step.transient) return null;
    return (
      <ReasoningStep
        step={step}
        steps={steps}
        conversationAttachments={conversationAttachments}
        attachmentRefs={attachmentRefs}
        conversationId={conversationId}
      />
    );
  }
  if (isToolCallStep(step)) {
    return <ToolCallStep step={step} />;
  }
  if (isCompactionStep(step)) {
    return <CompactionStep step={step} />;
  }
  if (isBackgroundAgentCompleteStep(step)) {
    return <BackgroundAgentStep step={step} />;
  }
  if (isAskUserQuestionStep(step)) {
    return <AskUserQuestionStepEvent step={step} />;
  }
  return null;
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationRoundStep,
  ToolCallStep,
} from '@kbn/agent-builder-common/chat/conversation';
import { isToolCallStep, isTodosStep } from '@kbn/agent-builder-common/chat/conversation';

export type GroupedStep =
  | { kind: 'step'; step: ConversationRoundStep; index: number }
  | { kind: 'group'; steps: ToolCallStep[] };

export const groupSteps = (steps: ConversationRoundStep[]): GroupedStep[] => {
  const result: GroupedStep[] = [];
  let toolBuffer: ToolCallStep[] = [];

  const flushBuffer = () => {
    if (toolBuffer.length > 0) {
      result.push({ kind: 'group', steps: toolBuffer });
      toolBuffer = [];
    }
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (isToolCallStep(step)) {
      toolBuffer.push(step);
    } else if (!isTodosStep(step)) {
      flushBuffer();
      result.push({ kind: 'step', step, index: i });
    }
  }

  flushBuffer();

  return result;
};

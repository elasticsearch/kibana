/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { z } from '@kbn/zod/v4';
import { AgentExecutionMode, ToolType, internalTools } from '@kbn/agent-builder-common';
import { AgentPromptType } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import { createErrorResult } from '@kbn/agent-builder-server';

const optionSchema = z.object({
  label: z.string().describe('Short label for the option'),
  description: z.string().optional().describe('Optional longer description'),
});

const questionSchema = z.object({
  question: z.string().describe('The question text shown to the user'),
  options: z.array(optionSchema).describe('The list of selectable options'),
  multi_select: z
    .boolean()
    .default(false)
    .describe('When true the user can pick more than one option'),
});

const schema = z.object({
  questions: z.array(questionSchema).describe('List of questions to ask the user'),
});

const description = `Ask the user multiple-choice questions.

## Overview

Calling this tool will show a rich UI widget to the user to let them answer the questions, and pause the agent execution until they do.

For each question, the user will be able to:
1. select one (or multiple if 'multi_select' is true) of the options.
2. enter a custom (free text) response.
3. skip the question.

Once the user has answered all questions, the execution will resume and the responses will appear as the result of the tool call.

## When to use

- When your current instructions (e.g. from active skills) are asking you to.
- When the user's request is ambiguous AND the missing information cannot be inferred from the conversation or other tools.

## Guideline

- There is no hard cap on the number of questions or options, but try to keep them to a reasonable number:
  - 1 to 5 questions per call.
  - 2 to 4 options per question.

- Do **NOT** call this tool in parallel (with itself or other tools). The tool pauses the execution, and is meant to be called independently so the interrupt state is clean.

- Using a description (in addition to the label) for each option is optional but recommended.

- The "question" field should contain *only* the question itself. Do **NOT** add instructions such as "Pick as many as you like" or "Pick one" — the UI already indicates whether the question is single or multi-choice.
`;

export const createAskUserQuestionTool = (): BuiltinToolDefinition<typeof schema> => {
  return {
    id: internalTools.askUserQuestion,
    description,
    type: ToolType.builtin,
    schema,
    tags: ['system'],
    handler: async ({ questions }, ctx) => {
      if (ctx.executionMode === AgentExecutionMode.standalone) {
        return {
          results: [
            createErrorResult(
              'ask_user_question is not available in standalone or sub-agent mode (no interactive user).'
            ),
          ],
        };
      }

      return {
        prompt: {
          type: AgentPromptType.ask_user_question,
          id: uuidv4(),
          questions,
        },
      };
    },
  };
};

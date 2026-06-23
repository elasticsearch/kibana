/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BaseMessageLike } from '@langchain/core/messages';
import type { ResolvedAgentCapabilities } from '@kbn/agent-builder-common';
import type { ToolManager } from '@kbn/agent-builder-server/runner';
import type { ExperimentalFeatures } from '@kbn/agent-builder-server';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { ResolvedConfiguration } from '../types';
import type { ProcessedConversation } from '../utils/prepare_conversation';
import type { ToolCallResultTransformer } from '../utils/tool_summarization';
import type { ResearchAgentAction, AnswerAgentAction } from '../actions';

export interface PromptFactoryParams {
  configuration: ResolvedConfiguration;
  capabilities: ResolvedAgentCapabilities;
  processedConversation: ProcessedConversation;
  skills: InternalSkillDefinition[];
  /**
   * Tool manager, used by intra-round compaction to map tool ids and look up summarizers.
   */
  toolManager: ToolManager;
  /**
   * Transformer for tool call results in conversation history.
   * Used to summarize/substitute large results to optimize context.
   */
  resultTransformer: ToolCallResultTransformer;
  outputSchema?: Record<string, unknown>;
  conversationTimestamp: string;
  experimentalFeatures: ExperimentalFeatures;
}

export interface ResearchAgentPromptRuntimeParams {
  cycleLimit: number;
  actions: ResearchAgentAction[];
}

export interface AnswerAgentPromptRuntimeParams {
  cycleLimit: number;
  actions: ResearchAgentAction[];
  answerActions: AnswerAgentAction[];
}

export interface PromptFactory {
  getMainPrompt(params: ResearchAgentPromptRuntimeParams): Promise<BaseMessageLike[]>;
  getStructuredAnswerPrompt(params: AnswerAgentPromptRuntimeParams): Promise<BaseMessageLike[]>;
}

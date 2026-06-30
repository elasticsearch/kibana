/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ConversationAction,
  ConversationAccessControl,
  ConversationRound,
  AgentCapabilities,
  AssistantResponse,
  RuntimeAgentConfigurationOverrides,
} from '@kbn/agent-builder-common';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import type { BrowserApiToolMetadata } from '@kbn/agent-builder-common';
import type { PromptRequest, PromptResponse } from '@kbn/agent-builder-common/agents';

/**
 * Body payload for the public agent_builder converse endpoints (`/api/agent_builder/converse`, `/converse/async`).
 */
export interface ChatRequestBodyPayload {
  agent_id?: string;
  connector_id?: string | null;
  inference_id?: string | null;
  conversation_id?: string;
  access_control?: ConversationAccessControl;
  execution_id?: string;
  capabilities?: AgentCapabilities;
  attachments?: AttachmentInput[];
  input?: string;
  prompts?: Record<string, PromptResponse>;
  browser_api_tools?: BrowserApiToolMetadata[];
  configuration_overrides?: RuntimeAgentConfigurationOverrides;
  action?: ConversationAction;
  /** Force a specific execution mode. When omitted, the server auto-detects. */
  _execution_mode?: 'local' | 'task_manager';
}

export type ChatResponse = Omit<
  ConversationRound,
  'id' | 'input' | 'pending_prompts' | 'response' | 'state'
> & {
  conversation_id: string;
  access_control: ConversationAccessControl;
  round_id: string;
  response: Partial<AssistantResponse> & {
    prompts?: PromptRequest[];
  };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { LlmProxy } from '@kbn/ftr-llm-proxy';
import { ConversationAccessControlMode } from '@kbn/agent-builder-common';
import { setupAgentDirectAnswer } from './proxy_scenario';
import { API_AGENT_BUILDER } from './constants';
import { AGENT_BUILDER_PUBLIC_API_HEADERS } from './kbn_public_api_headers';

interface SeedConversationInput {
  title: string;
  userMessage: string;
  expectedResponse: string;
}

/**
 * Resolves the id of the GenAI connector created for the LLM proxy (named `llm-proxy`
 * by {@link createGenAiConnectorForProxy}), so `converse` requests can name it explicitly.
 */
export async function getGenAiConnectorId(kbnClient: KbnClient): Promise<string> {
  const list = await kbnClient.request<Array<{ id: string; name: string }>>({
    method: 'GET',
    path: '/api/actions/connectors',
  });
  const connectors = Array.isArray(list.data) ? list.data : [];
  const connector = connectors.find((c) => c.name === 'llm-proxy');
  if (!connector) {
    throw new Error('No `llm-proxy` GenAI connector found — is the llmProxy fixture active?');
  }
  return connector.id;
}

/**
 * Seeds a conversation carrying one completed round through the public `converse` API
 * (LLM proxy mocked), returning the new conversation id. Used instead of driving the
 * full-screen chat UI, which navigates and waits on the streamed-response animation and
 * overruns the test budget. The conversation is created public so it lists regardless of
 * which admin identity the browser session uses.
 */
export async function seedConversationViaConverse(
  kbnClient: KbnClient,
  llmProxy: LlmProxy,
  connectorId: string,
  { title, userMessage, expectedResponse }: SeedConversationInput
): Promise<string> {
  await setupAgentDirectAnswer({ proxy: llmProxy, title, response: expectedResponse });
  const res = await kbnClient.request<{ conversation_id: string }>({
    method: 'POST',
    path: `${API_AGENT_BUILDER}/converse`,
    headers: { ...AGENT_BUILDER_PUBLIC_API_HEADERS, 'kbn-xsrf': 'scout-agent-builder' },
    body: {
      input: userMessage,
      connector_id: connectorId,
      _execution_mode: 'local',
      access_control: { access_mode: ConversationAccessControlMode.Public },
    },
  });
  await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
  return res.data.conversation_id;
}

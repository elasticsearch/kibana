/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Conversation, ConversationWithoutRounds } from '@kbn/agent-builder-common';
import { ConversationAccessControlMode } from '@kbn/agent-builder-common';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { createLlmProxy, type LlmProxy } from '@kbn/ftr-llm-proxy';
import type { ChatResponse } from '../../../../common/http_api/chat';
import type {
  DeleteConversationResponse,
  ListConversationsResponse,
} from '../../../../common/http_api/conversations';
import type { AuthedApiClient } from '../../../scout_agent_builder_shared/lib/authed_api_client';
import {
  createGenAiConnectorForProxy,
  deleteConnectorById,
} from '../../../scout_agent_builder_shared/lib/connector_kbn';
import { setupAgentDirectAnswer } from '../../../scout_agent_builder_shared/lib/proxy_scenario';
import { apiTest } from '../fixtures';
import { API_AGENT_BUILDER, CHAT_CONVERSATIONS_INDEX } from '../fixtures/constants';

apiTest.describe(
  'Agent Builder — conversations API',
  { tag: [...tags.stateful.classic, ...tags.serverless.search] },
  () => {
    let llmProxy: LlmProxy;
    let connectorId: string;

    apiTest.beforeAll(async ({ log, kbnClient }) => {
      llmProxy = await createLlmProxy(log);
      const { id } = await createGenAiConnectorForProxy(kbnClient, llmProxy);
      connectorId = id;
    });

    apiTest.afterAll(async ({ kbnClient, esClient }) => {
      llmProxy.close();
      await deleteConnectorById(kbnClient, connectorId);
      await esClient.deleteByQuery({
        index: CHAT_CONVERSATIONS_INDEX,
        query: { match_all: {} },
        wait_for_completion: true,
        refresh: true,
        conflicts: 'proceed',
        ignore_unavailable: true,
      });
    });

    async function createConversationWithResponse(
      asAdmin: AuthedApiClient,
      input: string,
      title: string,
      accessControl?: { access_mode: ConversationAccessControlMode }
    ): Promise<ChatResponse> {
      await setupAgentDirectAnswer({
        proxy: llmProxy,
        title,
        response: `Response to: ${input}`,
      });
      const res = await asAdmin.post(`${API_AGENT_BUILDER}/converse`, {
        body: {
          input,
          connector_id: connectorId,
          _execution_mode: 'local',
          ...(accessControl ? { access_control: accessControl } : {}),
        },
        responseType: 'json',
      });
      expect(res).toHaveStatusCode(200);
      const body = res.body as ChatResponse;
      await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
      return body;
    }

    async function createConversation(
      asAdmin: AuthedApiClient,
      input: string,
      title: string
    ): Promise<string> {
      const body = await createConversationWithResponse(asAdmin, input, title);
      return body.conversation_id;
    }

    apiTest('GET /conversations lists conversations with expected shape', async ({ asAdmin }) => {
      for (let i = 0; i < 3; i++) {
        await createConversation(asAdmin, `Test message ${i}`, `Test Conversation ${i}`);
      }
      const response = await asAdmin.get(`${API_AGENT_BUILDER}/conversations`, {
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(
        response.body !== null && typeof response.body === 'object' && 'results' in response.body
      ).toBe(true);
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBeGreaterThan(0);
      const conversation = response.body.results[0] as ConversationWithoutRounds;
      expect(typeof conversation.id).toBe('string');
      expect(typeof conversation.title).toBe('string');
      expect(typeof conversation.agent_id).toBe('string');
      expect(conversation.user).toBeDefined();
      expect(conversation.created_at).toBeDefined();
      expect(conversation.updated_at).toBeDefined();
      expect('rounds' in conversation).toBe(false);
    });

    apiTest('GET /conversations includes created conversations', async ({ asAdmin }) => {
      const testConversationIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        testConversationIds.push(
          await createConversation(asAdmin, `Verify message ${i}`, `Verify Conversation ${i}`)
        );
      }
      const response = await asAdmin.get(`${API_AGENT_BUILDER}/conversations`, {
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      const body = response.body as ListConversationsResponse;
      const conversationIds = body.results.map((c) => c.id);
      for (const testId of testConversationIds) {
        expect(conversationIds).toContain(testId);
      }
    });

    apiTest('GET /conversations filters by agent_id', async ({ asAdmin }) => {
      const conversationId = await createConversation(
        asAdmin,
        'Agent filter test',
        'Agent Filter Test'
      );
      const conversationRes = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationId)}`,
        { responseType: 'json' }
      );
      expect(conversationRes).toHaveStatusCode(200);
      const agentId = (conversationRes.body as Conversation).agent_id;

      const response = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations?${new URLSearchParams({ agent_id: agentId })}`,
        {
          responseType: 'json',
        }
      );
      expect(response).toHaveStatusCode(200);
      const body = response.body as ListConversationsResponse;
      for (const conv of body.results) {
        expect(conv.agent_id).toBe(agentId);
      }
    });

    apiTest(
      'GET /conversations returns empty when filtering unknown agent_id',
      async ({ asAdmin }) => {
        const response = await asAdmin.get(
          `${API_AGENT_BUILDER}/conversations?${new URLSearchParams({
            agent_id: 'non-existent-agent-id',
          })}`,
          {
            responseType: 'json',
          }
        );
        expect(response).toHaveStatusCode(200);
        const body = response.body as ListConversationsResponse;
        expect(body.results).toStrictEqual([]);
      }
    );

    apiTest('GET /conversations/:id returns conversation with rounds', async ({ asAdmin }) => {
      const testInput = 'Test message for get endpoint';
      const testTitle = 'Get Test Conversation';
      const testConversationId = await createConversation(asAdmin, testInput, testTitle);

      const response = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(testConversationId)}`,
        { responseType: 'json' }
      );
      expect(response).toHaveStatusCode(200);
      const conversation = response.body as Conversation;
      expect(conversation.id).toBe(testConversationId);
      expect(conversation.title).toBe(testTitle);
      expect(typeof conversation.user === 'object' && conversation.user !== null).toBe(true);
      expect(conversation.rounds.length).toBeGreaterThan(0);
    });

    apiTest('GET /conversations/:id includes round messages', async ({ asAdmin }) => {
      const testConversationId = await createConversation(
        asAdmin,
        'Test message for get endpoint',
        'Get Test Conversation'
      );
      const response = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(testConversationId)}`,
        {
          responseType: 'json',
        }
      );
      expect(response).toHaveStatusCode(200);
      const conversation = response.body as Conversation;
      const firstRound = conversation.rounds[0];
      expect(
        typeof firstRound.input === 'object' &&
          firstRound.input !== null &&
          'message' in firstRound.input
      ).toBe(true);
      expect(
        typeof firstRound.response === 'object' &&
          firstRound.response !== null &&
          'message' in firstRound.response
      ).toBe(true);
      expect(Array.isArray(firstRound.steps)).toBe(true);
    });

    apiTest('converse create exposes and stores conversation access mode', async ({ asAdmin }) => {
      const defaultBody = await createConversationWithResponse(
        asAdmin,
        'Default access mode test',
        'Default Access Mode Test'
      );
      expect(defaultBody.access_control).toStrictEqual({
        access_mode: ConversationAccessControlMode.Private,
      });

      const defaultConversationRes = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(defaultBody.conversation_id)}`,
        { responseType: 'json' }
      );
      expect(defaultConversationRes).toHaveStatusCode(200);
      expect((defaultConversationRes.body as Conversation).access_control).toStrictEqual({
        access_mode: ConversationAccessControlMode.Private,
      });

      const publicBody = await createConversationWithResponse(
        asAdmin,
        'Public access mode test',
        'Public Access Mode Test',
        {
          access_mode: ConversationAccessControlMode.Public,
        }
      );
      expect(publicBody.access_control).toStrictEqual({
        access_mode: ConversationAccessControlMode.Public,
      });

      const publicConversationRes = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(publicBody.conversation_id)}`,
        { responseType: 'json' }
      );
      expect(publicConversationRes).toHaveStatusCode(200);
      expect((publicConversationRes.body as Conversation).access_control).toStrictEqual({
        access_mode: ConversationAccessControlMode.Public,
      });
    });

    apiTest('converse ignores access mode when continuing a conversation', async ({ asAdmin }) => {
      const publicBody = await createConversationWithResponse(
        asAdmin,
        'Immutable access mode create test',
        'Immutable Access Mode Create Test',
        {
          access_mode: ConversationAccessControlMode.Public,
        }
      );

      await setupAgentDirectAnswer({
        proxy: llmProxy,
        response: 'Response to: Immutable access mode continue test',
        continueConversation: true,
      });
      const continueRes = await asAdmin.post(`${API_AGENT_BUILDER}/converse`, {
        body: {
          input: 'Immutable access mode continue test',
          conversation_id: publicBody.conversation_id,
          connector_id: connectorId,
          _execution_mode: 'local',
          access_control: {
            access_mode: ConversationAccessControlMode.Private,
          },
        },
        responseType: 'json',
      });
      expect(continueRes).toHaveStatusCode(200);
      await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
      expect((continueRes.body as ChatResponse).access_control).toStrictEqual({
        access_mode: ConversationAccessControlMode.Public,
      });

      const conversationRes = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(publicBody.conversation_id)}`,
        { responseType: 'json' }
      );
      expect(conversationRes).toHaveStatusCode(200);
      expect((conversationRes.body as Conversation).access_control).toStrictEqual({
        access_mode: ConversationAccessControlMode.Public,
      });
    });

    apiTest('GET /conversations/:id returns 404 for missing id', async ({ asAdmin }) => {
      const response = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/non-existent-conversation-id-12345`,
        { responseType: 'json' }
      );
      expect(response).toHaveStatusCode(404);
      expect(String((response.body as { message?: string }).message)).toContain('not found');
    });

    apiTest('DELETE /conversations/:id deletes then GET 404', async ({ asAdmin }) => {
      const conversationToDelete = await createConversation(
        asAdmin,
        'Message for delete test',
        'Delete Test Conversation'
      );
      const del = await asAdmin.delete(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationToDelete)}`,
        { responseType: 'json' }
      );
      expect(del).toHaveStatusCode(200);
      expect((del.body as DeleteConversationResponse).success).toBe(true);
      const getRes = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationToDelete)}`,
        { responseType: 'json' }
      );
      expect(getRes).toHaveStatusCode(404);
    });

    apiTest('DELETE /conversations/:id returns 404 when missing', async ({ asAdmin }) => {
      const response = await asAdmin.delete(
        `${API_AGENT_BUILDER}/conversations/non-existent-conversation-to-delete`,
        { responseType: 'json' }
      );
      expect(response).toHaveStatusCode(404);
      expect(String((response.body as { message?: string }).message)).toContain('not found');
    });

    apiTest('DELETE cannot delete same conversation twice', async ({ asAdmin }) => {
      const conversationToDelete = await createConversation(
        asAdmin,
        'Message for double delete',
        'Double Delete Conversation'
      );
      const first = await asAdmin.delete(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationToDelete)}`,
        { responseType: 'json' }
      );
      expect(first).toHaveStatusCode(200);
      const second = await asAdmin.delete(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationToDelete)}`,
        { responseType: 'json' }
      );
      expect(second).toHaveStatusCode(404);
    });

    apiTest('conversation lifecycle: create, list, get, delete', async ({ asAdmin }) => {
      const testTitle = 'Lifecycle Test Conversation';
      const conversationId = await createConversation(asAdmin, 'Lifecycle test message', testTitle);

      const list1 = await asAdmin.get(`${API_AGENT_BUILDER}/conversations`, {
        responseType: 'json',
      });
      expect(list1).toHaveStatusCode(200);
      let ids = (list1.body as ListConversationsResponse).results.map((c) => c.id);
      expect(ids).toContain(conversationId);

      const getRes = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationId)}`,
        { responseType: 'json' }
      );
      expect(getRes).toHaveStatusCode(200);
      expect((getRes.body as Conversation).title).toBe(testTitle);

      await asAdmin.delete(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationId)}`,
        { responseType: 'json' }
      );

      const list2 = await asAdmin.get(`${API_AGENT_BUILDER}/conversations`, {
        responseType: 'json',
      });
      expect(list2).toHaveStatusCode(200);
      ids = (list2.body as ListConversationsResponse).results.map((c) => c.id);
      expect(ids).not.toContain(conversationId);

      const get404 = await asAdmin.get(
        `${API_AGENT_BUILDER}/conversations/${encodeURIComponent(conversationId)}`,
        { responseType: 'json' }
      );
      expect(get404).toHaveStatusCode(404);
    });
  }
);

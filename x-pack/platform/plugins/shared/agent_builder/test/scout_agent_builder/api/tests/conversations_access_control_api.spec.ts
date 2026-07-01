/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { randomUUID } from 'crypto';
import {
  AgentAccessControlMode,
  ConversationAccessControlMode,
  type Conversation,
  type ConversationWithoutRounds,
} from '@kbn/agent-builder-common';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { createLlmProxy, type LlmProxy } from '@kbn/ftr-llm-proxy';
import type { ChatResponse } from '../../../../common/http_api/chat';
import type { ListConversationsResponse } from '../../../../common/http_api/conversations';
import { setupAgentDirectAnswer } from '../../../scout_agent_builder_shared/lib/proxy_scenario';
import { internalApiPath, publicApiPath } from '../../../../common/constants';
import { apiTest } from '../fixtures';
import {
  CHAT_CONVERSATIONS_INDEX,
  COMMON_HEADERS,
  ELASTIC_API_VERSION,
} from '../fixtures/constants';
import { spaceUrl } from '../fixtures/space_paths';

const ACCESS_CONTROL_TEST_PREFIX = 'conversation-access-control-test';

function mockAgent(id: string, accessMode: AgentAccessControlMode) {
  return {
    id,
    name: 'Conversation Access Control Test Agent',
    description: 'Fixture for conversation access-control tests',
    access_control: { access_mode: accessMode },
    configuration: {
      instructions: 'Respond directly to the user',
      tools: [{ tool_ids: ['*'] }],
    },
  };
}

interface KibanaRole {
  elasticsearch?: { cluster?: string[]; indices?: unknown[]; run_as?: string[] };
  kibana?: Array<{
    base?: string[];
    feature?: Record<string, string[]>;
    spaces: string[];
  }>;
}

function agentBuilderRole(accessControlSpaceId: string, privileges: string[]): KibanaRole {
  return {
    elasticsearch: { cluster: ['monitor_inference'], indices: [], run_as: [] },
    kibana: [
      {
        base: [],
        feature: {
          agentBuilder: privileges,
          actions: ['read'],
        },
        spaces: [accessControlSpaceId],
      },
    ],
  };
}

function basicAuthHeader(username: string, password: string): Record<string, string> {
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

apiTest.describe(
  'Agent Builder — conversations access-control API',
  { tag: [...tags.stateful.classic] },
  () => {
    const testRunId = randomUUID();
    const accessControlSpaceId = `${ACCESS_CONTROL_TEST_PREFIX}-space-${testRunId}`;
    const accessControlApiBase = spaceUrl(publicApiPath, accessControlSpaceId);
    const accessControlInternalBase = spaceUrl(internalApiPath, accessControlSpaceId);

    // Two native Kibana users with `manageAgents`, distinct usernames.
    // Lets us exercise owner-vs-non-owner scenarios against a real authn identity.
    const alice = {
      roleName: `${ACCESS_CONTROL_TEST_PREFIX}-alice-role-${testRunId}`,
      username: `${ACCESS_CONTROL_TEST_PREFIX}-alice-${testRunId}`,
      password: 'alice-password',
    };
    const bob = {
      roleName: `${ACCESS_CONTROL_TEST_PREFIX}-bob-role-${testRunId}`,
      username: `${ACCESS_CONTROL_TEST_PREFIX}-bob-${testRunId}`,
      password: 'bob-password',
    };
    // No Agent Builder privileges. Used to assert route-level privilege gates.
    const noAccess = {
      roleName: `${ACCESS_CONTROL_TEST_PREFIX}-no-access-role-${testRunId}`,
      username: `${ACCESS_CONTROL_TEST_PREFIX}-no-access-${testRunId}`,
      password: 'no-access-password',
    };

    const allPrincipals = [alice, bob, noAccess];

    let adminCookie: Record<string, string>;
    let llmProxy: LlmProxy;
    let connectorId: string;

    const headersFor = (user: { username: string; password: string }) => ({
      ...COMMON_HEADERS,
      ...basicAuthHeader(user.username, user.password),
      'elastic-api-version': ELASTIC_API_VERSION,
    });
    const adminInternalHeaders = () => ({
      ...COMMON_HEADERS,
      ...adminCookie,
      'elastic-api-version': ELASTIC_API_VERSION,
    });
    const adminPublicHeaders = () => ({ 'elastic-api-version': ELASTIC_API_VERSION });

    const createdAgentIds = new Set<string>();
    const trackAgent = (id: string) => {
      createdAgentIds.add(id);
      return id;
    };

    const createConnectorForSpace = async (kbnClient: any, proxy: LlmProxy): Promise<string> => {
      const response = (await kbnClient.request({
        method: 'POST',
        path: `${spaceUrl('', accessControlSpaceId)}/api/actions/connector`,
        headers: { 'kbn-xsrf': 'scout-agent-builder' },
        body: {
          name: 'llm-proxy',
          config: {
            apiProvider: 'OpenAI',
            apiUrl: `http://localhost:${proxy.getPort()}`,
            defaultModel: 'gpt-4',
          },
          secrets: { apiKey: 'myApiKey' },
          connector_type_id: '.gen-ai',
        },
      })) as { data: { id: string } };
      return response.data.id;
    };

    const deleteConnectorForSpace = async (kbnClient: any, id: string): Promise<void> => {
      await kbnClient.request({
        method: 'DELETE',
        path: `${spaceUrl('', accessControlSpaceId)}/api/actions/connector/${encodeURIComponent(
          id
        )}`,
        headers: { 'kbn-xsrf': 'scout-agent-builder' },
        ignoreErrors: [404],
      });
    };

    apiTest.beforeAll(async ({ esClient, samlAuth, kbnClient, log }) => {
      const { cookieHeader } = await samlAuth.asInteractiveUser('admin');
      adminCookie = cookieHeader;
      llmProxy = await createLlmProxy(log);

      await kbnClient.request({
        method: 'POST',
        path: '/api/spaces/space',
        headers: adminPublicHeaders(),
        body: { id: accessControlSpaceId, name: accessControlSpaceId, disabledFeatures: [] },
      });

      connectorId = await createConnectorForSpace(kbnClient, llmProxy);

      for (const { roleName } of [alice, bob]) {
        await kbnClient.request({
          method: 'PUT',
          path: `/api/security/role/${encodeURIComponent(roleName)}`,
          headers: adminPublicHeaders(),
          body: agentBuilderRole(accessControlSpaceId, ['minimal_read', 'manage_agents']),
        });
      }
      await kbnClient.request({
        method: 'PUT',
        path: `/api/security/role/${encodeURIComponent(noAccess.roleName)}`,
        headers: adminPublicHeaders(),
        body: { elasticsearch: { cluster: [], indices: [], run_as: [] } },
      });

      for (const user of allPrincipals) {
        await kbnClient.request({
          method: 'POST',
          path: `/internal/security/users/${encodeURIComponent(user.username)}`,
          headers: adminInternalHeaders(),
          body: {
            username: user.username,
            password: user.password,
            roles: [user.roleName],
            full_name: user.username,
            enabled: true,
          },
        });
      }

      await esClient.deleteByQuery({
        index: CHAT_CONVERSATIONS_INDEX,
        query: { term: { space: accessControlSpaceId } },
        wait_for_completion: true,
        refresh: true,
        conflicts: 'proceed',
        ignore_unavailable: true,
      });
    });

    apiTest.afterAll(async ({ apiClient, kbnClient, esClient }) => {
      const deleteAgentIfPresent = async (agentId: string) => {
        const response = await apiClient.delete(
          `${accessControlApiBase}/agents/${encodeURIComponent(agentId)}`,
          {
            headers: adminInternalHeaders(),
          }
        );
        expect([200, 404]).toContain(response.statusCode);
      };

      const deleteKibanaResourceIfPresent = async (
        path: string,
        headers: Record<string, string>
      ) => {
        await kbnClient.request({
          method: 'DELETE',
          path,
          headers,
          ignoreErrors: [404],
        });
      };

      // Agents first (their authz still uses ES; admin can delete anything).
      for (const agentId of createdAgentIds) {
        await deleteAgentIfPresent(agentId);
      }
      await esClient.deleteByQuery({
        index: CHAT_CONVERSATIONS_INDEX,
        query: { term: { space: accessControlSpaceId } },
        wait_for_completion: true,
        refresh: true,
        conflicts: 'proceed',
        ignore_unavailable: true,
      });
      await deleteConnectorForSpace(kbnClient, connectorId);
      llmProxy.close();

      for (const user of allPrincipals) {
        await deleteKibanaResourceIfPresent(
          `/internal/security/users/${encodeURIComponent(user.username)}`,
          adminInternalHeaders()
        );
        await deleteKibanaResourceIfPresent(
          `/api/security/role/${encodeURIComponent(user.roleName)}`,
          adminPublicHeaders()
        );
      }
      await deleteKibanaResourceIfPresent(
        `/api/spaces/space/${encodeURIComponent(accessControlSpaceId)}`,
        adminPublicHeaders()
      );
    });

    // ── helpers ─────────────────────────────────────────────────────────────

    const createAgentAs = async (
      apiClient: any,
      user: { username: string; password: string },
      agent: ReturnType<typeof mockAgent>
    ) => {
      const response = await apiClient.post(`${accessControlApiBase}/agents`, {
        headers: headersFor(user),
        body: agent,
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      trackAgent(agent.id);
      return response;
    };

    const setAgentAccessModeAs = async (
      apiClient: any,
      user: { username: string; password: string },
      agentId: string,
      accessMode: AgentAccessControlMode
    ) => {
      const response = await apiClient.put(
        `${accessControlApiBase}/agents/${encodeURIComponent(agentId)}`,
        {
          headers: headersFor(user),
          body: { access_control: { access_mode: accessMode } },
          responseType: 'json',
        }
      );
      expect(response).toHaveStatusCode(200);
    };

    const createConversationAs = async ({
      apiClient,
      user,
      agentId,
      input,
      title,
      accessMode,
    }: {
      apiClient: any;
      user: { username: string; password: string };
      agentId: string;
      input: string;
      title: string;
      accessMode?: ConversationAccessControlMode;
    }): Promise<ChatResponse> => {
      await setupAgentDirectAnswer({
        proxy: llmProxy,
        title,
        response: `Response to: ${input}`,
      });
      const response = await apiClient.post(`${accessControlApiBase}/converse`, {
        headers: headersFor(user),
        body: {
          agent_id: agentId,
          input,
          connector_id: connectorId,
          _execution_mode: 'local',
          ...(accessMode ? { access_control: { access_mode: accessMode } } : {}),
        },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
      return response.body as ChatResponse;
    };

    const listConversationIdsAs = async (
      apiClient: any,
      user: { username: string; password: string }
    ): Promise<string[]> => {
      const response = await apiClient.get(`${accessControlApiBase}/conversations`, {
        headers: headersFor(user),
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      return (response.body as ListConversationsResponse).results.map(
        (conversation: ConversationWithoutRounds) => conversation.id
      );
    };

    const markConversationReadAs = async (
      apiClient: any,
      user: { username: string; password: string },
      conversationId: string,
      read: boolean
    ) => {
      return apiClient.post(
        `${accessControlInternalBase}/conversations/${encodeURIComponent(
          conversationId
        )}/_mark_read`,
        {
          headers: headersFor(user),
          body: { read },
          responseType: 'json',
        }
      );
    };

    const renameConversationAs = async (
      apiClient: any,
      user: { username: string; password: string },
      conversationId: string,
      title: string
    ) => {
      return apiClient.post(
        `${accessControlInternalBase}/conversations/${encodeURIComponent(conversationId)}/_rename`,
        {
          headers: headersFor(user),
          body: { title },
          responseType: 'json',
        }
      );
    };

    // ── public conversation access ──────────────────────────────────────────

    apiTest(
      'public conversations require same-space conversation access and agent use access',
      async ({ apiClient }) => {
        const agentId = `${ACCESS_CONTROL_TEST_PREFIX}-agent-${testRunId.slice(0, 8)}`;
        await createAgentAs(apiClient, alice, mockAgent(agentId, AgentAccessControlMode.Shared));

        const publicConversation = await createConversationAs({
          apiClient,
          user: alice,
          agentId,
          input: 'Public conversation access test',
          title: 'Public Conversation Access Test',
          accessMode: ConversationAccessControlMode.Public,
        });

        const bobOwnedPublicConversation = await createConversationAs({
          apiClient,
          user: bob,
          agentId,
          input: 'Bob-owned public conversation access test',
          title: 'Bob-Owned Public Conversation Access Test',
          accessMode: ConversationAccessControlMode.Public,
        });

        const privateConversation = await createConversationAs({
          apiClient,
          user: alice,
          agentId,
          input: 'Private conversation access test',
          title: 'Private Conversation Access Test',
        });

        await apiTest.step(
          'Bob can list and get public conversations for usable agents',
          async () => {
            const bobConversationIds = await listConversationIdsAs(apiClient, bob);
            expect(bobConversationIds).toContain(publicConversation.conversation_id);

            const getResponse = await apiClient.get(
              `${accessControlApiBase}/conversations/${encodeURIComponent(
                publicConversation.conversation_id
              )}`,
              { headers: headersFor(bob), responseType: 'json' }
            );
            expect(getResponse).toHaveStatusCode(200);
            expect((getResponse.body as Conversation).id).toBe(publicConversation.conversation_id);
          }
        );

        await apiTest.step(
          'Bob can continue a public conversation for a usable agent',
          async () => {
            await setupAgentDirectAnswer({
              proxy: llmProxy,
              response: 'Response to: Bob public follow-up',
              continueConversation: true,
            });
            const continueResponse = await apiClient.post(`${accessControlApiBase}/converse`, {
              headers: headersFor(bob),
              body: {
                agent_id: agentId,
                conversation_id: publicConversation.conversation_id,
                input: 'Bob public follow-up',
                connector_id: connectorId,
                _execution_mode: 'local',
              },
              responseType: 'json',
            });
            expect(continueResponse).toHaveStatusCode(200);
            await llmProxy.waitForAllInterceptorsToHaveBeenCalled();
          }
        );

        await apiTest.step('Bob can mark a public conversation read', async () => {
          const markReadResponse = await markConversationReadAs(
            apiClient,
            bob,
            publicConversation.conversation_id,
            true
          );
          expect(markReadResponse).toHaveStatusCode(200);
          expect(markReadResponse.body).toMatchObject({
            id: publicConversation.conversation_id,
            read: true,
          });
        });

        await apiTest.step('Bob cannot rename or delete Alice public conversation', async () => {
          const renameResponse = await renameConversationAs(
            apiClient,
            bob,
            publicConversation.conversation_id,
            'Bob renamed public conversation'
          );
          expect(renameResponse).toHaveStatusCode(404);

          const deleteResponse = await apiClient.delete(
            `${accessControlApiBase}/conversations/${encodeURIComponent(
              publicConversation.conversation_id
            )}`,
            { headers: headersFor(bob), responseType: 'json' }
          );
          expect(deleteResponse).toHaveStatusCode(404);

          const getResponse = await apiClient.get(
            `${accessControlApiBase}/conversations/${encodeURIComponent(
              publicConversation.conversation_id
            )}`,
            { headers: headersFor(alice), responseType: 'json' }
          );
          expect(getResponse).toHaveStatusCode(200);
          expect((getResponse.body as Conversation).title).toBe('Public Conversation Access Test');
        });

        await apiTest.step('Bob cannot list or get Alice private conversations', async () => {
          const bobConversationIds = await listConversationIdsAs(apiClient, bob);
          expect(bobConversationIds).not.toContain(privateConversation.conversation_id);

          const getPrivateResponse = await apiClient.get(
            `${accessControlApiBase}/conversations/${encodeURIComponent(
              privateConversation.conversation_id
            )}`,
            { headers: headersFor(bob), responseType: 'json' }
          );
          expect(getPrivateResponse).toHaveStatusCode(404);
        });

        await apiTest.step(
          'Bob loses access when the underlying agent becomes private',
          async () => {
            await setAgentAccessModeAs(apiClient, alice, agentId, AgentAccessControlMode.Private);

            const bobConversationIds = await listConversationIdsAs(apiClient, bob);
            expect(bobConversationIds).not.toContain(publicConversation.conversation_id);
            expect(bobConversationIds).not.toContain(bobOwnedPublicConversation.conversation_id);

            const getPublicResponse = await apiClient.get(
              `${accessControlApiBase}/conversations/${encodeURIComponent(
                publicConversation.conversation_id
              )}`,
              { headers: headersFor(bob), responseType: 'json' }
            );
            expect(getPublicResponse).toHaveStatusCode(404);

            const getOwnPublicResponse = await apiClient.get(
              `${accessControlApiBase}/conversations/${encodeURIComponent(
                bobOwnedPublicConversation.conversation_id
              )}`,
              { headers: headersFor(bob), responseType: 'json' }
            );
            expect(getOwnPublicResponse).toHaveStatusCode(404);

            const continueOwnPublicResponse = await apiClient.post(
              `${accessControlApiBase}/converse`,
              {
                headers: headersFor(bob),
                body: {
                  agent_id: agentId,
                  conversation_id: bobOwnedPublicConversation.conversation_id,
                  input: 'Bob-owned public follow-up after revocation',
                  connector_id: connectorId,
                  _execution_mode: 'local',
                },
                responseType: 'json',
              }
            );
            expect(continueOwnPublicResponse).toHaveStatusCode(404);

            const markReadResponse = await markConversationReadAs(
              apiClient,
              bob,
              publicConversation.conversation_id,
              false
            );
            expect(markReadResponse).toHaveStatusCode(404);

            const markOwnReadResponse = await markConversationReadAs(
              apiClient,
              bob,
              bobOwnedPublicConversation.conversation_id,
              false
            );
            expect(markOwnReadResponse).toHaveStatusCode(404);
          }
        );
      }
    );

    // ── route-level privileges ──────────────────────────────────────────────

    apiTest(
      'route-level privilege remains distinct from resource access',
      async ({ apiClient }) => {
        const response = await apiClient.get(`${accessControlApiBase}/conversations`, {
          headers: headersFor(noAccess),
          responseType: 'json',
        });

        expect(response).toHaveStatusCode(403);
      }
    );
  }
);

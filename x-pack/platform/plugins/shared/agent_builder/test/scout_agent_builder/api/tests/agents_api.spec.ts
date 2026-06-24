/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AgentAccessControlMode } from '@kbn/agent-builder-common';
import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/api';
import { apiTest } from '../fixtures';
import { API_AGENT_BUILDER } from '../fixtures/constants';

apiTest.describe(
  'Agent Builder — agents API',
  { tag: [...tags.stateful.classic, ...tags.serverless.search] },
  () => {
    const createdAgentIds: string[] = [];

    const mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent for API testing',
      configuration: {
        instructions: 'You are a helpful test agent',
        tools: [
          {
            tool_ids: ['*'],
          },
        ],
      },
    };

    apiTest.afterAll(async ({ asAdmin }) => {
      await Promise.allSettled(
        createdAgentIds.map((agentId) =>
          asAdmin.delete(`${API_AGENT_BUILDER}/agents/${encodeURIComponent(agentId)}`)
        )
      );
    });

    apiTest('POST /api/agent_builder/agents creates agent', async ({ asAdmin }) => {
      const response = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: mockAgent,
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        id: mockAgent.id,
        name: mockAgent.name,
        description: mockAgent.description,
      });
      expect(response.body.configuration).toBeDefined();
      expect(response.body.configuration).toMatchObject({
        instructions: mockAgent.configuration.instructions,
        tools: mockAgent.configuration.tools,
      });
      createdAgentIds.push(mockAgent.id);
    });

    apiTest('POST /api/agent_builder/agents validates agent ID format', async ({ asAdmin }) => {
      const invalidAgent = {
        ...mockAgent,
        id: 'invalid agent id!',
      };
      const response = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: invalidAgent,
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(400);
      expect(response.body.message).toBeDefined();
      expect(String(response.body.message)).toContain('Invalid agent id');
    });

    apiTest('POST /api/agent_builder/agents requires required fields', async ({ asAdmin }) => {
      const response = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: { id: 'incomplete-agent' },
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(400);
    });

    apiTest('POST /api/agent_builder/agents validates tool configuration', async ({ asAdmin }) => {
      const agentWithInvalidTools = {
        ...mockAgent,
        id: 'invalid-tools-agent',
        configuration: {
          instructions: 'Test agent with invalid tools',
          tools: [
            {
              tool_ids: ['non-existent-tool'],
            },
          ],
        },
      };
      const response = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: agentWithInvalidTools,
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(400);
    });

    apiTest(
      'POST /api/agent_builder/agents defaults access-control mode to public with created_by',
      async ({ asAdmin }) => {
        const agentId = `access-control-default-agent-${Date.now()}`;
        const response = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
          body: { ...mockAgent, id: agentId },
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(200);
        expect(response.body).toMatchObject({
          id: agentId,
          access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
        });
        expect(response.body.created_by).toBeDefined();
        expect(typeof response.body.created_by.username).toBe('string');
        createdAgentIds.push(agentId);
      }
    );

    apiTest('GET /api/agent_builder/agents/:id retrieves existing agent', async ({ asAdmin }) => {
      const testAgent = { ...mockAgent, id: 'get-test-agent' };
      const createRes = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: testAgent,
        responseType: 'json',
      });
      expect(createRes).toHaveStatusCode(200);
      createdAgentIds.push(createRes.body.id as string);

      const response = await asAdmin.get(`${API_AGENT_BUILDER}/agents/get-test-agent`, {
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        id: 'get-test-agent',
        name: mockAgent.name,
        description: mockAgent.description,
      });
      expect(response.body.configuration.instructions).toBe(mockAgent.configuration.instructions);
      expect(response.body.configuration.tools).toStrictEqual(mockAgent.configuration.tools);
    });

    apiTest(
      'GET /api/agent_builder/agents/:id returns 404 for missing agent',
      async ({ asAdmin }) => {
        const response = await asAdmin.get(`${API_AGENT_BUILDER}/agents/non-existent-agent`, {
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(404);
        expect(response.body.message).toBeDefined();
        expect(String(response.body.message)).toContain('not found');
      }
    );

    apiTest('GET /api/agent_builder/agents lists agents', async ({ asAdmin }) => {
      const testAgentIds: string[] = [];
      for (let i = 0; i < 3; i++) {
        const testAgent = {
          ...mockAgent,
          id: `list-test-agent-${i}`,
          name: `List Test Agent ${i}`,
        };
        const res = await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
          body: testAgent,
          responseType: 'json',
        });
        expect(res).toHaveStatusCode(200);
        testAgentIds.push(testAgent.id);
        createdAgentIds.push(testAgent.id);
      }

      const response = await asAdmin.get(`${API_AGENT_BUILDER}/agents`, {
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body.results).toBeDefined();
      expect(Array.isArray(response.body.results)).toBe(true);
      expect(response.body.results.length).toBeGreaterThan(1);
    });

    apiTest('PUT /api/agent_builder/agents/:id updates agent fields', async ({ asAdmin }) => {
      const testAgent = { ...mockAgent, id: 'update-test-agent' };
      await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: testAgent,
        responseType: 'json',
      });
      createdAgentIds.push(testAgent.id);

      const updates = { name: 'Updated Test Agent', description: 'Updated description' };
      const response = await asAdmin.put(`${API_AGENT_BUILDER}/agents/update-test-agent`, {
        body: updates,
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({
        id: 'update-test-agent',
        name: updates.name,
        description: updates.description,
      });
    });

    apiTest('PUT /api/agent_builder/agents/:id updates configuration', async ({ asAdmin }) => {
      const configUpdates = {
        configuration: {
          instructions: 'Updated instructions for the agent',
          tools: [],
        },
      };
      const response = await asAdmin.put(`${API_AGENT_BUILDER}/agents/update-test-agent`, {
        body: configUpdates,
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({ id: 'update-test-agent' });
      expect(response.body.configuration.instructions).toBe(
        configUpdates.configuration.instructions
      );
      expect(response.body.configuration.tools).toStrictEqual(configUpdates.configuration.tools);
    });

    apiTest(
      'PUT /api/agent_builder/agents/:id returns 404 for missing agent',
      async ({ asAdmin }) => {
        const response = await asAdmin.put(`${API_AGENT_BUILDER}/agents/non-existent-agent`, {
          body: { name: 'Updated name' },
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(404);
      }
    );

    apiTest('DELETE /api/agent_builder/agents/:id deletes agent', async ({ asAdmin }) => {
      const testAgent = { ...mockAgent, id: 'delete-test-agent' };
      await asAdmin.post(`${API_AGENT_BUILDER}/agents`, {
        body: testAgent,
        responseType: 'json',
      });
      createdAgentIds.push(testAgent.id);

      const response = await asAdmin.delete(`${API_AGENT_BUILDER}/agents/delete-test-agent`, {
        responseType: 'json',
      });
      expect(response).toHaveStatusCode(200);
      expect(response.body).toMatchObject({ success: true });
      const removeIdx = createdAgentIds.indexOf('delete-test-agent');
      // eslint-disable-next-line playwright/prefer-comparison-matcher
      expect(removeIdx >= 0).toBe(true);
      createdAgentIds.splice(removeIdx, 1);
    });

    apiTest(
      'DELETE /api/agent_builder/agents/:id returns 404 for missing agent',
      async ({ asAdmin }) => {
        const response = await asAdmin.delete(`${API_AGENT_BUILDER}/agents/non-existent-agent`, {
          responseType: 'json',
        });
        expect(response).toHaveStatusCode(404);
        expect(response.body.message).toBeDefined();
        expect(String(response.body.message)).toContain('not found');
      }
    );
  }
);

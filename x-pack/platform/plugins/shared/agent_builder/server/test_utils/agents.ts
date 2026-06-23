/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentDefinition } from '@kbn/agent-builder-common';
import { AgentType, AgentAccessControlMode } from '@kbn/agent-builder-common';
import type { AgentsServiceStart, AgentRegistry } from '../services/agents';
import type { InternalAgentDefinition } from '../services/agents/agent_registry';

export type MockedAgent = jest.Mocked<AgentDefinition>;
export type MockedInternalAgent = jest.Mocked<InternalAgentDefinition>;
export type AgentsServiceStartMock = jest.Mocked<AgentsServiceStart>;
export type AgentRegistryMock = jest.Mocked<AgentRegistry>;

export const createMockedAgentRegistry = (): AgentRegistryMock => {
  return {
    has: jest.fn(),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    list: jest.fn(),
    delete: jest.fn(),
    getAccessControl: jest.fn(),
    updateAccessControl: jest.fn(),
  };
};

export const createMockedAgent = (parts: Partial<AgentDefinition> = {}): MockedAgent => {
  return {
    type: AgentType.chat,
    id: 'test_agent',
    name: 'Test Agent',
    description: 'My test agent',
    configuration: {
      tools: [],
    },
    access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
    created_by: { username: 'test-user' },
    readonly: false,
    ...parts,
  };
};

export const createMockedInternalAgent = (
  parts: Partial<InternalAgentDefinition> = {}
): MockedInternalAgent => {
  return {
    type: AgentType.chat,
    id: 'test_agent',
    name: 'Test Agent',
    description: 'My test agent',
    configuration: {
      tools: [],
    },
    access_control: { access_mode: AgentAccessControlMode.Public, entries: [] },
    created_by: { username: 'test-user' },
    readonly: false,
    permissions: {
      update_agent: true,
      update_access_control: true,
    },
    isAvailable: jest.fn() as any,
    ...parts,
  };
};

export const createAgentsServiceStartMock = (): AgentsServiceStartMock => {
  return {
    getRegistry: jest.fn().mockImplementation(() => createMockedAgentRegistry()),
    removeToolRefsFromAgents: jest.fn(),
    getAgentsUsingTools: jest.fn(),
    removePluginRefsFromAgents: jest.fn(),
    getAgentsUsingPlugins: jest.fn(),
    removeSkillRefsFromAgents: jest.fn(),
    getAgentsUsingSkills: jest.fn(),
  };
};

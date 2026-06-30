/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, EMPTY } from 'rxjs';
import type {
  AgentsServiceStartContract,
  AttachmentServiceStartContract,
  RendererServiceStartContract,
  ToolServiceStartContract,
} from '@kbn/agent-builder-browser';
import type {
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  ConversationSidebarRef,
} from './types';
import type { OpenConversationSidebarOptions } from './sidebar/types';

const createSetupContractMock = (): jest.Mocked<AgentBuilderPluginSetup> => {
  return {};
};

export type AgentsServiceStartContractMock = jest.Mocked<AgentsServiceStartContract>;
export type AttachmentServiceStartContractMock = jest.Mocked<AttachmentServiceStartContract>;
export type RendererServiceStartContractMock = jest.Mocked<RendererServiceStartContract>;
export type ToolServiceStartContractMock = jest.Mocked<ToolServiceStartContract>;

export type AgentBuilderPluginStartMock = jest.Mocked<AgentBuilderPluginStart> & {
  agents: AgentsServiceStartContractMock;
  attachments: AttachmentServiceStartContractMock;
  renderers: RendererServiceStartContractMock;
  tools: ToolServiceStartContractMock;
};

const createAgentStartMock = (): AgentsServiceStartContractMock => {
  return {
    list: jest.fn(),
    addSkillToAgent: jest.fn(),
  };
};

const createAttachmentStartMock = (): AttachmentServiceStartContractMock => {
  return {
    addAttachmentType: jest.fn(),
    getAttachmentUiDefinition: jest.fn(),
  };
};

const createRendererStartMock = (): RendererServiceStartContractMock => {
  return {
    register: jest.fn(),
    getRendererUiDefinition: jest.fn(),
    hasRenderer: jest.fn(),
  };
};

const createToolStartMock = (): ToolServiceStartContractMock => {
  return {
    get: jest.fn(),
    list: jest.fn(),
    execute: jest.fn(),
    listWorkflows: jest.fn(),
  };
};

const createStartContractMock = (): AgentBuilderPluginStartMock => {
  return {
    agents: createAgentStartMock(),
    attachments: createAttachmentStartMock(),
    renderers: createRendererStartMock(),
    tools: createToolStartMock(),
    events: {
      chat$: EMPTY,
      getChatEvents$: jest.fn().mockReturnValue(EMPTY),
      ui: {
        activeConversation$: new BehaviorSubject(null),
      },
    },
    setChatConfig: jest.fn(),
    clearChatConfig: jest.fn(),
    toggleChat: jest.fn(),
    openChat: jest.fn().mockImplementation((options: OpenConversationSidebarOptions) => {
      const mockSidebarRef: ConversationSidebarRef = {
        close: jest.fn(),
      };
      return {
        chatRef: mockSidebarRef,
      };
    }),
    addAttachment: jest.fn(),
    updateAttachmentOrigin: jest.fn(),
    EmbeddableConversation: () => null,
    EmbeddableConversationInput: () => null,
  };
};

export const agentBuilderMocks = {
  createSetup: createSetupContractMock,
  createStart: createStartContractMock,
};

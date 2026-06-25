/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MockedLogger } from '@kbn/logging-mocks';
import { loggerMock } from '@kbn/logging-mocks';
import {
  elasticsearchServiceMock,
  httpServerMock,
  savedObjectsServiceMock,
  securityServiceMock,
  uiSettingsServiceMock,
} from '@kbn/core/server/mocks';
import { spacesMock } from '@kbn/spaces-plugin/server/mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';
import type { KibanaRequest } from '@kbn/core-http-server';
import type {
  AgentHandlerContext,
  HooksServiceStart,
  ScopedRunner,
  ToolProvider,
  ToolRegistry,
  WritableToolResultStore,
} from '@kbn/agent-builder-server';
import type {
  ConversationStateManager,
  PluginsService,
  PromptManager,
  SkillsService,
  ToolManager,
  ToolPromptManager,
  ToolStateManager,
  WritableSkillsStore,
} from '@kbn/agent-builder-server/runner';
import { createTodoStateManager } from '@kbn/agent-builder-server/runner';
import type { AttachmentsService } from '@kbn/agent-builder-server/runner/attachments_service';
import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools/handler';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { AgentExecutionMode } from '@kbn/agent-builder-common';
import type { AttachmentServiceStart } from '../services/attachments';
import type { CreateRunnerDeps, CreateScopedRunnerDeps } from '../services/execution/runner/runner';
import type { ModelProviderFactoryMock, ModelProviderMock } from './model_provider';
import { createModelProviderFactoryMock, createModelProviderMock } from './model_provider';
import type { ToolsServiceStartMock } from './tools';
import { createToolsServiceStartMock } from './tools';
import type { AgentsServiceStartMock } from './agents';
import { createAgentsServiceStartMock } from './agents';
import type { SkillRegistry, SkillServiceStart } from '../services/skills';
import type { PluginsServiceStart } from '../services/plugins/plugin_service';

export type ToolResultStoreMock = jest.Mocked<WritableToolResultStore>;
export type SkillsStoreMock = jest.Mocked<WritableSkillsStore>;
export type SkillRegistryMock = jest.Mocked<SkillRegistry>;
export type AttachmentsServiceStartMock = jest.Mocked<AttachmentServiceStart>;
export type ToolProviderMock = jest.Mocked<ToolProvider>;
export type ToolRegistryMock = jest.Mocked<ToolRegistry>;
export type AttachmentsServiceMock = jest.Mocked<AttachmentsService>;
export type AttachmentStateManagerMock = jest.Mocked<AttachmentStateManager>;
export type PromptManagerMock = jest.Mocked<PromptManager>;
export type StateManagerMock = jest.Mocked<ConversationStateManager>;
export type SkillsServiceMock = jest.Mocked<SkillsService>;
export type ToolManagerMock = jest.Mocked<ToolManager>;
export type ToolPromptManagerMock = jest.Mocked<ToolPromptManager>;
export type ToolStateManagerMock = jest.Mocked<ToolStateManager>;
export type SkillServiceStartMock = jest.Mocked<SkillServiceStart>;
export type PluginsServiceStartMock = jest.Mocked<PluginsServiceStart>;
export type PluginsServiceMock = jest.Mocked<PluginsService>;

export const createToolProviderMock = (): ToolProviderMock => {
  return {
    has: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
  };
};

export const createToolRegistryMock = (): ToolRegistryMock => {
  return {
    has: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    execute: jest.fn(),
  };
};

const createEmptyVolumeMock = () => ({
  id: 'mock',
  get: jest.fn(),
  list: jest.fn().mockResolvedValue([]),
  glob: jest.fn().mockResolvedValue([]),
  exists: jest.fn().mockResolvedValue(false),
});

export const createToolResultStoreMock = (): ToolResultStoreMock => {
  return {
    has: jest.fn(),
    get: jest.fn(),
    add: jest.fn(),
    delete: jest.fn(),
    asReadonly: jest.fn(),
    getVolume: jest.fn().mockReturnValue(createEmptyVolumeMock()),
    getEntry: jest.fn().mockResolvedValue(undefined),
    listEntries: jest.fn().mockResolvedValue([]),
    entryExists: jest.fn().mockResolvedValue(false),
  } as unknown as ToolResultStoreMock;
};

export const createSkillsStoreMock = (): SkillsStoreMock => {
  return {
    has: jest.fn(),
    get: jest.fn(),
    add: jest.fn(),
    delete: jest.fn(),
    asReadonly: jest.fn(),
    getVolume: jest.fn().mockReturnValue(createEmptyVolumeMock()),
    getEntry: jest.fn().mockResolvedValue(undefined),
    listEntries: jest.fn().mockResolvedValue([]),
    entryExists: jest.fn().mockResolvedValue(false),
  } as unknown as SkillsStoreMock;
};

export const createAttachmentsServiceStartMock = (): AttachmentsServiceStartMock => {
  return {
    validate: jest.fn(),
    getTypeDefinition: jest.fn(),
    getRegisteredTypeIds: jest.fn(),
  };
};

export const createAttachmentsService = (): AttachmentsServiceMock => {
  return {
    getTypeDefinition: jest.fn(),
    convertAttachmentTool: jest.fn(),
    getRegisteredTypeIds: jest.fn(),
  };
};

export const createPromptManagerMock = (): PromptManagerMock => {
  return {
    set: jest.fn(),
    get: jest.fn(),
    delete: jest.fn(),
    dump: jest.fn(),
    getConfirmationStatus: jest.fn(),
    getAuthorizationStatus: jest.fn(),
    clear: jest.fn(),
    forTool: jest.fn(),
  };
};

export const createSkillsServiceMock = (): SkillsServiceMock => {
  return {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(undefined),
    bulkGet: jest.fn().mockResolvedValue(new Map()),
    convertSkillTool: jest.fn(),
  };
};

export const createToolManagerMock = (): ToolManagerMock => {
  return {
    setEventEmitter: jest.fn(),
    addTools: jest.fn(),
    list: jest.fn(),
    recordToolUse: jest.fn(),
    getToolIdMapping: jest.fn(),
    getToolMeta: jest.fn(),
    getExecutable: jest.fn(),
    getDynamicToolIds: jest.fn(),
    getSummarizer: jest.fn(),
  };
};

export const createStateManagerMock = (): StateManagerMock => {
  return {
    getToolStateManager: jest.fn(),
  };
};

export const createSkillServiceStartMock = (): SkillServiceStartMock => {
  return {
    getRegistry: jest.fn().mockResolvedValue(createSkillRegistryMock()),
    registerSkill: jest.fn().mockResolvedValue(undefined),
  };
};

export const createPluginsServiceStartMock = (): PluginsServiceStartMock => {
  return {
    getRegistry: jest.fn(),
    installPlugin: jest.fn(),
    deletePlugin: jest.fn(),
  };
};

export const createPluginsServiceMock = (): PluginsServiceMock => {
  return {
    resolveSkillIds: jest.fn().mockResolvedValue([]),
  };
};

export const createSkillRegistryMock = (): SkillRegistryMock => {
  return {
    has: jest.fn().mockResolvedValue(false),
    get: jest.fn(),
    bulkGet: jest.fn().mockResolvedValue(new Map()),
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
};

export const createAttachmentStateManagerMock = (): AttachmentStateManagerMock => {
  return {
    get: jest.fn(),
    getAttachmentRecord: jest.fn(),
    getActive: jest.fn(),
    getAll: jest.fn(),
    getDiff: jest.fn(),
    add: jest.fn(),
    update: jest.fn(),
    updateOrigin: jest.fn().mockResolvedValue(true),
    delete: jest.fn(),
    restore: jest.fn(),
    permanentDelete: jest.fn(),
    rename: jest.fn(),
    getAccessedRefs: jest.fn(),
    clearAccessTracking: jest.fn(),
    resolveRefs: jest.fn(),
    evaluateStalenessForActiveAttachments: jest.fn(),
    getTotalTokenEstimate: jest.fn(),
    hasChanges: jest.fn(),
    markClean: jest.fn(),
  };
};

export const createToolPromptManagerMock = (): ToolPromptManagerMock => {
  return {
    checkConfirmationStatus: jest.fn(),
    checkAuthorizationStatus: jest.fn(),
    askForConfirmation: jest.fn(),
    askForAuthorization: jest.fn(),
  };
};

export const createToolStateManagerMock = (): ToolStateManagerMock => {
  return {
    getState: jest.fn(),
    setState: jest.fn(),
  };
};

export interface CreateScopedRunnerDepsMock extends CreateScopedRunnerDeps {
  elasticsearch: ReturnType<typeof elasticsearchServiceMock.createStart>;
  security: ReturnType<typeof securityServiceMock.createStart>;
  modelProvider: ModelProviderMock;
  toolsService: ToolsServiceStartMock;
  agentsService: AgentsServiceStartMock;
  promptManager: PromptManagerMock;
  logger: MockedLogger;
  request: KibanaRequest;
  toolManager: ToolManagerMock;
  skillServiceStart: SkillServiceStartMock;
  pluginsServiceStart: PluginsServiceStartMock;
}

export interface CreateRunnerDepsMock extends CreateRunnerDeps {
  elasticsearch: ReturnType<typeof elasticsearchServiceMock.createStart>;
  security: ReturnType<typeof securityServiceMock.createStart>;
  modelProviderFactory: ModelProviderFactoryMock;
  toolsService: ToolsServiceStartMock;
  agentsService: AgentsServiceStartMock;
  logger: MockedLogger;
  skillServiceStart: SkillServiceStartMock;
  pluginsServiceStart: PluginsServiceStartMock;
  toolManager: ToolManagerMock;
}

export interface AgentHandlerContextMock extends AgentHandlerContext {
  toolProvider: ToolProviderMock;
  toolRegistry: ToolRegistryMock;
  resultStore: ToolResultStoreMock;
  skillsStore: SkillsStoreMock;
  attachments: AttachmentsServiceMock;
  skills: SkillsServiceMock;
  plugins: PluginsServiceMock;
  toolManager: ToolManagerMock;
}

export const createAgentHandlerContextMock = (): AgentHandlerContextMock => {
  return {
    request: httpServerMock.createKibanaRequest(),
    spaceId: 'default',
    esClient: elasticsearchServiceMock.createScopedClusterClient(),
    savedObjectsClient: savedObjectsServiceMock.createStartContract().getScopedClient({} as any),
    modelProvider: createModelProviderMock(),
    toolProvider: createToolProviderMock(),
    toolRegistry: createToolRegistryMock(),
    runner: createScopedRunnerMock(),
    attachments: createAttachmentsService(),
    resultStore: createToolResultStoreMock(),
    skillsStore: createSkillsStoreMock(),
    attachmentStateManager: createAttachmentStateManagerMock(),
    todoStateManager: createTodoStateManager(),
    events: {
      emit: jest.fn(),
    },
    logger: loggerMock.create(),
    promptManager: createPromptManagerMock(),
    stateManager: createStateManagerMock(),
    hooks: createHooksServiceStartMock(),
    filesystemService: {
      getFilesystem: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    },
    bashService: undefined,
    skills: createSkillsServiceMock(),
    plugins: createPluginsServiceMock(),
    toolManager: createToolManagerMock(),
    experimentalFeatures: {
      skills: false,
      subagents: false,
      todos: false,
      bash: false,
    },
    subAgentExecutor: {
      executeSubAgent: jest.fn(),
      getExecution: jest.fn(),
    },
    executionMode: AgentExecutionMode.conversation,
  };
};

export interface ToolHandlerContextMock extends ToolHandlerContext {
  toolProvider: ToolProviderMock;
  resultStore: ToolResultStoreMock;
  skillsStore: SkillsStoreMock;
  attachments: AttachmentStateManagerMock;
  prompts: ToolPromptManagerMock;
  stateManager: ToolStateManagerMock;
  skills: SkillsServiceMock;
  toolManager: ToolManagerMock;
  savedObjectsClient: ReturnType<
    ReturnType<typeof savedObjectsServiceMock.createStartContract>['getScopedClient']
  >;
}

export const createToolHandlerContextMock = (): ToolHandlerContextMock => {
  return {
    callContext: {
      toolId: 'toolId',
      toolCallId: 'toolCallId',
      callSource: 'agent',
    },
    request: httpServerMock.createKibanaRequest(),
    spaceId: 'default',
    esClient: elasticsearchServiceMock.createScopedClusterClient(),
    modelProvider: createModelProviderMock(),
    toolProvider: createToolProviderMock(),
    runner: createScopedRunnerMock(),
    resultStore: createToolResultStoreMock(),
    skillsStore: createSkillsStoreMock(),
    events: {
      reportProgress: jest.fn(),
      sendUiEvent: jest.fn(),
    },
    logger: loggerMock.create(),
    prompts: createToolPromptManagerMock(),
    stateManager: createToolStateManagerMock(),
    attachments: createAttachmentStateManagerMock(),
    skills: createSkillsServiceMock(),
    toolManager: createToolManagerMock(),
    savedObjectsClient: savedObjectsServiceMock.createStartContract().getScopedClient({} as any),
    runContext: { runId: 'mock-run-id', stack: [] },
  };
};

export const createScopedRunnerMock = (): jest.Mocked<ScopedRunner> => {
  return {
    runTool: jest.fn(),
    runInternalTool: jest.fn(),
    runAgent: jest.fn(),
  };
};

export const createHooksServiceStartMock = (): jest.Mocked<HooksServiceStart> => {
  return {
    run: jest.fn(async (_event: any, context: any) => context),
  };
};

export const createScopedRunnerDepsMock = (): CreateScopedRunnerDepsMock => {
  return {
    elasticsearch: elasticsearchServiceMock.createStart(),
    security: securityServiceMock.createStart(),
    savedObjects: savedObjectsServiceMock.createStartContract(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    spaces: spacesMock.createStart(),
    actions: actionsMock.createStart(),
    modelProvider: createModelProviderMock(),
    toolsService: createToolsServiceStartMock(),
    agentsService: createAgentsServiceStartMock(),
    logger: loggerMock.create(),
    request: httpServerMock.createKibanaRequest(),
    resultStore: createToolResultStoreMock(),
    skillsStore: createSkillsStoreMock(),
    attachmentStateManager: createAttachmentStateManagerMock(),
    todoStateManager: createTodoStateManager(),
    attachmentsService: createAttachmentsServiceStartMock(),
    promptManager: createPromptManagerMock(),
    stateManager: createStateManagerMock(),
    hooks: createHooksServiceStartMock(),
    skillServiceStart: createSkillServiceStartMock(),
    pluginsServiceStart: createPluginsServiceStartMock(),
    toolManager: createToolManagerMock(),
    subAgentExecutor: {
      executeSubAgent: jest.fn(),
      getExecution: jest.fn(),
    },
    executionMode: AgentExecutionMode.conversation,
  };
};

export const createRunnerDepsMock = (): CreateRunnerDepsMock => {
  return {
    elasticsearch: elasticsearchServiceMock.createStart(),
    security: securityServiceMock.createStart(),
    savedObjects: savedObjectsServiceMock.createStartContract(),
    uiSettings: uiSettingsServiceMock.createStartContract(),
    spaces: spacesMock.createStart(),
    actions: actionsMock.createStart(),
    modelProviderFactory: createModelProviderFactoryMock(),
    toolsService: createToolsServiceStartMock(),
    agentsService: createAgentsServiceStartMock(),
    logger: loggerMock.create(),
    attachmentsService: createAttachmentsServiceStartMock(),
    hooks: createHooksServiceStartMock(),
    skillServiceStart: createSkillServiceStartMock(),
    pluginsServiceStart: createPluginsServiceStartMock(),
    toolManager: createToolManagerMock(),
    getExecutionService: jest.fn(),
  };
};

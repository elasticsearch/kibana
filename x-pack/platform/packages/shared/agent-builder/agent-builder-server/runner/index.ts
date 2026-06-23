/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  Runner,
  RunToolFn,
  RunInternalToolFn,
  ScopedRunner,
  ScopedRunToolFn,
  ScopedRunnerRunInternalToolParams,
  ScopedRunInternalToolFn,
  ScopedRunnerRunToolsParams,
  RunInternalToolParams,
  RunContext,
  RunContextStackEntry,
  RunAgentStackEntry,
  RunToolStackEntry,
  RunToolParams,
  RunToolReturn,
} from './runner';
export { getAgentFromRunContext } from './run_context_utils';
export {
  type AgentBuilderToolEvent,
  type ToolEventHandlerFn,
  type ToolEventEmitter,
  type InternalToolProgressEvent,
} from './events';
export type {
  ToolProvider,
  ToolProviderHasOptions,
  ToolProviderGetOptions,
  ToolProviderListOptions,
  ExecutableTool,
  ExecutableToolHandlerParams,
  ExecutableToolHandlerFn,
  LLmDescriptionHandlerParams,
  LlmDescriptionHandler,
} from './tool_provider';
export type {
  ModelProvider,
  ScopedModel,
  ModelProviderStats,
  ModelCallInfo,
  ModelSelectionPreferences,
} from './model_provider';
export type { ToolResultStore, WritableToolResultStore, ToolResultWithMeta } from './result_store';
export type { AttachmentsService } from './attachments_service';
export type { SkillsService, SkillRegistryListOptions } from './skills_service';
export type { PluginsService } from './plugins_service';
export type { ToolManager } from './tool_manager';
export { ToolManagerToolType } from './tool_manager';
export type { SkillsStore, WritableSkillsStore } from './skills_store';
export type {
  PromptManager,
  ToolPromptManager,
  ConfirmationInfo,
  AuthorizationInfo,
} from './prompt_manager';
export type { ConversationStateManager, ToolStateManager } from './state_manager';
export type { TodoStateManager } from './todo_state_manager';
export { createTodoStateManager } from './todo_state_manager';
export { FileEntryType } from './filestore';
export type {
  FsEntry,
  DirEntry,
  FileEntry,
  FileEntryMetadata,
  FileEntryContent,
} from './filestore';
export type { FileEntryAccessor } from './file_entry_accessor';
export type { IFilesystemService } from './filesystem_service';
export type { IBashService, BashExecResult } from './bash_service';

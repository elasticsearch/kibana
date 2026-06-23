/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { formatAgentBuilderErrorMessage } from './base/errors';
export type {
  ToolServiceStartContract,
  ExecuteToolParams,
  ExecuteToolReturn,
  ListWorkflowsParams,
  ListWorkflowsResponse,
  WorkflowListItem,
} from './tools';
export type { AgentsServiceStartContract } from './agents';
export type { AttachmentUIDefinition, AttachmentServiceStartContract } from './attachments';
export type {
  EventsServiceStartContract,
  ChatUiEventsContract,
  BrowserChatEvent,
  ActiveConversation,
} from './events';
export { WorkflowComboBox } from './workflow_combo_box';
export type { WorkflowComboBoxProps, WorkflowComboBoxOption } from './workflow_combo_box';
export { ConversationInputShell } from './conversation_input_shell';
export type { ConversationInputShellProps } from './conversation_input_shell';
export type {
  AgentBuilderPluginSetup,
  AgentBuilderPluginStart,
  EmbeddableConversationProps,
  PublicEmbeddableConversationProps,
  PublicEmbeddableConversationInputProps,
  EmbeddableConversationInputRef,
  OpenConversationSidebarOptions,
  ConversationSidebarRef,
  OpenConversationSidebarReturn,
} from './plugin_contract';
export { AgentBuilderAnnouncementModal } from './announcement_modal/agent_builder_announcement_modal';
export type {
  AgentBuilderAnnouncementModalProps,
  AgentBuilderAnnouncementVariant,
} from './announcement_modal/agent_builder_announcement_modal';
export { McpClientDetails, McpClientLogo } from './oauth_clients';
export type {
  McpClientDetailsProps,
  McpClientDetailsData,
  McpClientDetailsPresentation,
  McpClientLogoProps,
} from './oauth_clients';

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ComponentType, RefAttributes } from 'react';
import type {
  AttachmentInput,
  ConversationAttachment,
  UpdateOriginResponse,
} from '@kbn/agent-builder-common/attachments';
import type { BrowserApiToolDefinition } from './tools/browser_api_tool';
import type {
  AgentsServiceStartContract,
  AttachmentServiceStartContract,
  EventsServiceStartContract,
  ToolServiceStartContract,
} from '.';

/**
 * Props for the embeddable conversation component.
 * Configures conversation behavior when embedded in the sidebar or other host.
 */
export interface EmbeddableConversationProps {
  /**
   * Force starting a new conversation, ignoring any stored conversation IDs.
   * When true, a fresh conversation is always created.
   * @default false
   */
  newConversation?: boolean;

  /**
   * Session tag for conversation context. Used to maintain separate conversation
   * histories for different parts of the application.
   *
   * Examples:
   * - 'dashboard' - Conversations started from dashboard page
   * - 'search' - Conversations started from search interface
   * - 'observability' - Conversations in observability context
   *
   * Combined with agentId to restore the correct conversation when the sidebar reopens.
   * @default 'default'
   */
  sessionTag?: string;

  /**
   * Specific agent ID to use for this conversation.
   * If not provided, uses the last selected agent from localStorage.
   *
   * Examples:
   * - 'platform.core.dashboard' - Dashboard agent
   * - 'platform.core.general' - General agent
   */
  agentId?: string;

  /**
   * Optional initial message content to use when starting a new conversation.
   * Only applies when creating a new conversation (not when restoring existing ones).
   * Use with `autoSendInitialMessage` to control whether this message is automatically sent.
   *
   * Example: 'Show me error logs from the last hour'
   */
  initialMessage?: string;
  /**
   * Whether to automatically send the initial message when starting a new conversation.
   * Only applies when creating a new conversation (not when restoring existing ones).
   * Requires `initialMessage` to be provided.
   *
   * @default false
   */
  autoSendInitialMessage?: boolean;
  /**
   * Optional attachments with lazy content loading.
   * Content will be fetched when starting a new conversation round.
   * It will be appended only if it has changed since previous conversation round.
   */
  attachments?: ConversationAttachment[];

  /**
   * Browser API tools that the agent can use to interact with the page.
   * Tools are executed browser-side when the LLM requests them.
   *
   * Example:
   * ```typescript
   * browserApiTools: [{
   *   id: 'dashboard.config.update_title',
   *   description: 'Update the dashboard title',
   *   schema: z.object({
   *     title: z.string().describe('The new title')
   *   }),
   *   handler: async ({ title }) => {
   *     dashboardApi.updateTitle(title);
   *   }
   * }]
   * ```
   */
  browserApiTools?: Array<BrowserApiToolDefinition<any>>;
}

/**
 * Props accepted by the publicly exposed `EmbeddableConversation` component.
 *
 * Inline embedders typically only need to pass `EmbeddableConversationProps`.
 * `onClose` and `ariaLabelledBy` are optional — sensible defaults are provided
 * by the plugin when omitted.
 */
export interface PublicEmbeddableConversationProps extends EmbeddableConversationProps {
  onClose?: () => void;
  ariaLabelledBy?: string;
}

export interface EmbeddableConversationInputRef {
  /**
   * Add an attachment pill to the input. The pill appears immediately and the
   * user can remove it before sending. Duplicates (matched by `id`) are merged.
   */
  addAttachment: (attachment: ConversationAttachment) => void;
}

export interface PublicEmbeddableConversationInputProps {
  /**
   * Agent the input is bound to. Defaults to `agentBuilderDefaultAgentId` when omitted.
   */
  agentId?: string;
}

/**
 * Options passed when opening or toggling the conversation sidebar.
 */
export interface OpenConversationSidebarOptions extends EmbeddableConversationProps {
  onClose?: () => void;
}

/**
 * Handle to control a conversation sidebar programmatically.
 */
export interface ConversationSidebarRef {
  close(): void;
}

/**
 * Return value from opening the conversation sidebar.
 */
export interface OpenConversationSidebarReturn {
  chatRef: ConversationSidebarRef;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface AgentBuilderPluginSetup {}

/**
 * Public start contract for the browser-side agentBuilder plugin.
 */
export interface AgentBuilderPluginStart {
  /**
   * Agent service contract, can be used to list agents.
   */
  agents: AgentsServiceStartContract;
  /**
   * Attachment service contract, can be used to register and retrieve attachment UI definitions.
   */
  attachments: AttachmentServiceStartContract;
  /**
   * Tool service contract, can be used to list or execute tools.
   */
  tools: ToolServiceStartContract;
  /**
   * Events service contract, can be used to listen to chat events.
   */
  events: EventsServiceStartContract;
  /**
   * Opens the conversation sidebar.
   *
   * @param options - Configuration options for the sidebar
   * @returns An object containing the sidebar reference
   *
   * @example
   * ```tsx
   * // Open a new conversation with close handler
   * const { chatRef } = plugins.agentBuilder.openChat({
   *   onClose: () => console.log('Chat closed')
   * });
   *
   * // Programmatically close the chat
   * chatRef.close();
   * ```
   */
  openChat: (options?: OpenConversationSidebarOptions) => OpenConversationSidebarReturn;
  /**
   * Toggles the conversation sidebar.
   *
   * If the sidebar is open, it will be closed. Otherwise, it will be opened.
   */
  toggleChat: (options?: OpenConversationSidebarOptions) => void;
  setChatConfig: (config: EmbeddableConversationProps) => void;
  clearChatConfig: () => void;
  /**
   * Adds an attachment to the active conversation sidebar.
   * If no sidebar is open, the attachment is ignored.
   *
   * @param attachment - The attachment to add
   */
  addAttachment: (attachment: AttachmentInput) => void;
  /**
   * Updates the origin of an attachment in a conversation.
   * Use this after saving a by-value attachment to link it to its persistent store.
   *
   * @param conversationId - The conversation containing the attachment
   * @param attachmentId - The ID of the attachment to update
   * @param origin - Origin string for the attachment (e.g. saved object id); same value passed to `resolve` on the server
   * @returns Promise resolving to the update result
   *
   * @example
   * ```tsx
   * // Link attachment to a saved object
   * await plugins.agentBuilder.updateAttachmentOrigin(
   *   conversationId,
   *   attachmentId,
   *   savedObjectId
   * );
   * ```
   */
  updateAttachmentOrigin: (
    conversationId: string,
    attachmentId: string,
    origin: string
  ) => Promise<UpdateOriginResponse>;
  /**
   * Inline-embeddable conversation component, pre-bound to the plugin's
   * internal services. Render this anywhere in the app to host a fully
   * functional agent_builder chat without the sidebar chrome.
   */
  EmbeddableConversation: ComponentType<PublicEmbeddableConversationProps>;
  /**
   * Inline-embeddable chat **input** component, pre-bound to the plugin's
   * internal services.
   *
   * Use this when you want to give users an Agent Builder–style entry point
   * inside your own UI without hosting the full conversation.
   *
   * @example
   * ```tsx
   * const inputRef = useRef<EmbeddableConversationInputRef>(null);
   *
   * <plugins.agentBuilder.EmbeddableConversationInput
   *   ref={inputRef}
   *   agentId="my-agent-id"
   * />
   * <button onClick={() => inputRef.current?.addAttachment(att)}>Attach</button>
   * ```
   */
  EmbeddableConversationInput: ComponentType<
    PublicEmbeddableConversationInputProps & RefAttributes<EmbeddableConversationInputRef>
  >;
}

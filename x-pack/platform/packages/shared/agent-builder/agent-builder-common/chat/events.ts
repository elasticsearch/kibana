/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderEvent } from '../base/events';
import type { ToolOrigin, ToolType } from '../tools/definition';
import type { ToolResult } from '../tools/tool_result';
import type {
  ConversationInternalState,
  ConversationRound,
  BackgroundExecutionState,
  TodoItem,
} from './conversation';
import type {
  PromptRequestSource,
  PromptRequest,
  AskUserQuestionItem,
  AskUserQuestionAnswer,
} from '../agents/prompts';
import type { VersionedAttachment } from '../attachments';

export enum ChatEventType {
  toolCall = 'tool_call',
  browserToolCall = 'browser_tool_call',
  toolProgress = 'tool_progress',
  toolUi = 'tool_ui',
  toolResult = 'tool_result',
  reasoning = 'reasoning',
  messageChunk = 'message_chunk',
  messageComplete = 'message_complete',
  thinkingComplete = 'thinking_complete',
  promptRequest = 'prompt_request',
  roundComplete = 'round_complete',
  conversationCreated = 'conversation_created',
  conversationUpdated = 'conversation_updated',
  conversationIdSet = 'conversation_id_set',
  compactionStarted = 'compaction_started',
  compactionCompleted = 'compaction_completed',
  backgroundAgentComplete = 'background_agent_complete',
  userQuestionAsked = 'user_question_asked',
  userQuestionAnswered = 'user_question_answered',
}

export type ChatEventBase<
  TEventType extends ChatEventType,
  TData extends Record<string, any>
> = AgentBuilderEvent<TEventType, TData>;

// Tool call

export interface ToolCallEventData {
  tool_call_id: string;
  tool_id: string;
  params: Record<string, unknown>;
  tool_call_group_id?: string;
  tool_origin?: ToolOrigin;
  tool_type?: ToolType;
}

export type ToolCallEvent = ChatEventBase<ChatEventType.toolCall, ToolCallEventData>;

export const isToolCallEvent = (event: AgentBuilderEvent<string, any>): event is ToolCallEvent => {
  return event.type === ChatEventType.toolCall;
};

export interface BrowserToolCallEventData {
  tool_call_id: string;
  tool_id: string;
  params: Record<string, unknown>;
}

export type BrowserToolCallEvent = ChatEventBase<
  ChatEventType.browserToolCall,
  BrowserToolCallEventData
>;

export const isBrowserToolCallEvent = (
  event: AgentBuilderEvent<string, any>
): event is BrowserToolCallEvent => {
  return event.type === ChatEventType.browserToolCall;
};

// Tool progress

export interface ToolProgressEventData {
  tool_call_id: string;
  message: string;
  metadata?: Record<string, string>;
}

export type ToolProgressEvent = ChatEventBase<ChatEventType.toolProgress, ToolProgressEventData>;

export const isToolProgressEvent = (
  event: AgentBuilderEvent<string, any>
): event is ToolProgressEvent => {
  return event.type === ChatEventType.toolProgress;
};

// Tool UI events

export interface ToolUiEventData<TEvent = string, TData extends object = object> {
  tool_id: string;
  tool_call_id: string;
  custom_event: TEvent;
  data: TData;
}

export type ToolUiEvent<
  TEvent extends string = string,
  TData extends object = object
> = ChatEventBase<ChatEventType.toolUi, ToolUiEventData<TEvent, TData>>;

export const isToolUiEvent = <TEvent extends string = string, TData extends object = object>(
  event: AgentBuilderEvent<string, any>,
  customType?: TEvent
): event is ToolUiEvent<TEvent, TData> => {
  if (event.type !== ChatEventType.toolUi) {
    return false;
  }
  return customType ? event.data.custom_event === customType : true;
};

// Tool result

export interface ToolResultEventData {
  tool_call_id: string;
  tool_id: string;
  results: ToolResult[];
}

export type ToolResultEvent = ChatEventBase<ChatEventType.toolResult, ToolResultEventData>;

export const isToolResultEvent = (
  event: AgentBuilderEvent<string, any>
): event is ToolResultEvent => {
  return event.type === ChatEventType.toolResult;
};

// Prompt request

export interface PromptRequestEventData {
  prompt: PromptRequest;
  source: PromptRequestSource;
}

export type PromptRequestEvent = ChatEventBase<ChatEventType.promptRequest, PromptRequestEventData>;

export const isPromptRequestEvent = (
  event: AgentBuilderEvent<string, any>
): event is PromptRequestEvent => {
  return event.type === ChatEventType.promptRequest;
};

// Ask-user-question lifecycle

export interface UserQuestionAskedEventData {
  prompt_id: string;
  questions: AskUserQuestionItem[];
}

export type UserQuestionAskedEvent = ChatEventBase<
  ChatEventType.userQuestionAsked,
  UserQuestionAskedEventData
>;

export const isUserQuestionAskedEvent = (
  event: AgentBuilderEvent<string, any>
): event is UserQuestionAskedEvent => {
  return event.type === ChatEventType.userQuestionAsked;
};

export const createUserQuestionAskedEvent = (
  data: UserQuestionAskedEventData
): UserQuestionAskedEvent => {
  return {
    type: ChatEventType.userQuestionAsked,
    data,
  };
};

export interface UserQuestionAnsweredEventData {
  prompt_id: string;
  answers: AskUserQuestionAnswer[];
}

export type UserQuestionAnsweredEvent = ChatEventBase<
  ChatEventType.userQuestionAnswered,
  UserQuestionAnsweredEventData
>;

export const isUserQuestionAnsweredEvent = (
  event: AgentBuilderEvent<string, any>
): event is UserQuestionAnsweredEvent => {
  return event.type === ChatEventType.userQuestionAnswered;
};

export const createUserQuestionAnsweredEvent = (
  data: UserQuestionAnsweredEventData
): UserQuestionAnsweredEvent => {
  return {
    type: ChatEventType.userQuestionAnswered,
    data,
  };
};

// reasoning

export interface ReasoningEventData {
  /** plain text reasoning content */
  reasoning: string;
  /** when reasoning is bound to a tool call, the corresponding tool call ID */
  tool_call_id?: string;
  /** when reasoning is bound to a tool call, the corresponding tool call group */
  tool_call_group_id?: string;
  /** if true, will not be persisted or displaying in the thinking panel, only displayed as "current thinking" **/
  transient?: boolean;
}

export type ReasoningEvent = ChatEventBase<ChatEventType.reasoning, ReasoningEventData>;

export const isReasoningEvent = (
  event: AgentBuilderEvent<string, any>
): event is ReasoningEvent => {
  return event.type === ChatEventType.reasoning;
};

// Message chunk

export interface MessageChunkEventData {
  /** ID of the message this chunk is bound to */
  message_id: string;
  /** chunk (text delta) */
  text_chunk: string;
}

export type MessageChunkEvent = ChatEventBase<ChatEventType.messageChunk, MessageChunkEventData>;

export const isMessageChunkEvent = (
  event: AgentBuilderEvent<string, any>
): event is MessageChunkEvent => {
  return event.type === ChatEventType.messageChunk;
};

// Message complete

export interface MessageCompleteEventData {
  /** ID of the message */
  message_id: string;
  /** full text content of the message */
  message_content: string;
  /** optional structured data */
  structured_output?: object;
}

export type MessageCompleteEvent = ChatEventBase<
  ChatEventType.messageComplete,
  MessageCompleteEventData
>;

export const isMessageCompleteEvent = (
  event: AgentBuilderEvent<string, any>
): event is MessageCompleteEvent => {
  return event.type === ChatEventType.messageComplete;
};

// Thinking complete

export interface ThinkingCompleteEventData {
  /** time elapsed from round start to first token arrival, in ms */
  time_to_first_token: number;
}

export type ThinkingCompleteEvent = ChatEventBase<
  ChatEventType.thinkingComplete,
  ThinkingCompleteEventData
>;

export const isThinkingCompleteEvent = (
  event: AgentBuilderEvent<string, any>
): event is ThinkingCompleteEvent => {
  return event.type === ChatEventType.thinkingComplete;
};

// Round complete

export interface RoundCompleteEventData {
  /** round that was completed */
  round: ConversationRound;
  /** if true, it means the round was resumed, so we need to replace the last one instead of adding a new one */
  resumed?: boolean;
  /** if the prompt state was updated during the round, contains the up-to-date version */
  conversation_state?: ConversationInternalState;
  /**
   * Updated conversation-level attachments after this round.
   **/
  attachments?: VersionedAttachment[];
  /**
   * Set when this round initialized the bash/VFS workspace for this conversation.
   */
  workspace_id?: string;
}

export type RoundCompleteEvent = ChatEventBase<ChatEventType.roundComplete, RoundCompleteEventData>;

export const isRoundCompleteEvent = (
  event: AgentBuilderEvent<string, any>
): event is RoundCompleteEvent => {
  return event.type === ChatEventType.roundComplete;
};

// conversation created

export interface ConversationCreatedEventData {
  conversation_id: string;
  title: string;
}

export type ConversationCreatedEvent = ChatEventBase<
  ChatEventType.conversationCreated,
  ConversationCreatedEventData
>;

export const isConversationCreatedEvent = (
  event: AgentBuilderEvent<string, any>
): event is ConversationCreatedEvent => {
  return event.type === ChatEventType.conversationCreated;
};

// conversation updated

export interface ConversationUpdatedEventData {
  conversation_id: string;
  title: string;
}

export type ConversationUpdatedEvent = ChatEventBase<
  ChatEventType.conversationUpdated,
  ConversationUpdatedEventData
>;

export const isConversationUpdatedEvent = (
  event: AgentBuilderEvent<string, any>
): event is ConversationUpdatedEvent => {
  return event.type === ChatEventType.conversationUpdated;
};

// conversation id set

export interface ConversationIdSetEventData {
  conversation_id: string;
}

export type ConversationIdSetEvent = ChatEventBase<
  ChatEventType.conversationIdSet,
  ConversationIdSetEventData
>;

export const isConversationIdSetEvent = (
  event: AgentBuilderEvent<string, any>
): event is ConversationIdSetEvent => {
  return event.type === ChatEventType.conversationIdSet;
};

// Compaction started

export interface CompactionStartedEventData {
  /** Estimated token count before compaction */
  token_count_before: number;
}

export type CompactionStartedEvent = ChatEventBase<
  ChatEventType.compactionStarted,
  CompactionStartedEventData
>;

export const isCompactionStartedEvent = (
  event: AgentBuilderEvent<string, any>
): event is CompactionStartedEvent => {
  return event.type === ChatEventType.compactionStarted;
};

// Compaction completed

export interface CompactionCompletedEventData {
  /** Estimated token count after compaction */
  token_count_after: number;
  /** Number of rounds that were summarized */
  summarized_round_count: number;
}

export type CompactionCompletedEvent = ChatEventBase<
  ChatEventType.compactionCompleted,
  CompactionCompletedEventData
>;

export const isCompactionCompletedEvent = (
  event: AgentBuilderEvent<string, any>
): event is CompactionCompletedEvent => {
  return event.type === ChatEventType.compactionCompleted;
};

export interface BackgroundAgentCompleteEventData {
  execution: BackgroundExecutionState;
}

export type BackgroundAgentCompleteEvent = ChatEventBase<
  ChatEventType.backgroundAgentComplete,
  BackgroundAgentCompleteEventData
>;

export const isBackgroundAgentCompleteEvent = (
  event: AgentBuilderEvent<string, any>
): event is BackgroundAgentCompleteEvent => {
  return event.type === ChatEventType.backgroundAgentComplete;
};

export const TODOS_UPDATED_UI_EVENT = 'todos_updated' as const;

export interface TodosUpdatedUiEventData {
  todos: TodoItem[];
}

export const isTodosUpdatedEvent = (event: AgentBuilderEvent<string, any>) => {
  return isToolUiEvent<typeof TODOS_UPDATED_UI_EVENT, TodosUpdatedUiEventData>(
    event,
    TODOS_UPDATED_UI_EVENT
  );
};

/**
 * All types of events that can be emitted from an agent execution.
 */
export type ChatAgentEvent =
  | ToolCallEvent
  | BrowserToolCallEvent
  | ToolProgressEvent
  | ToolUiEvent
  | ToolResultEvent
  | PromptRequestEvent
  | ReasoningEvent
  | MessageChunkEvent
  | MessageCompleteEvent
  | ThinkingCompleteEvent
  | RoundCompleteEvent
  | CompactionStartedEvent
  | CompactionCompletedEvent
  | BackgroundAgentCompleteEvent
  | UserQuestionAskedEvent
  | UserQuestionAnsweredEvent;

/**
 * All types of events that can be emitted from the chat API.
 */
export type ChatEvent =
  | ChatAgentEvent
  | ConversationCreatedEvent
  | ConversationUpdatedEvent
  | ConversationIdSetEvent;

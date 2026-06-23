/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserIdAndName } from '../base/users';
import type { ToolOrigin, ToolType } from '../tools/definition';
import type { ToolResult } from '../tools/tool_result';
import type { ExecutionStatus, SerializedExecutionError } from '../agents/execution_status';
import type {
  Attachment,
  VersionedAttachment,
  AttachmentInput,
  AttachmentVersionRef,
} from '../attachments';
import type {
  PromptRequest,
  PromptResponse,
  PromptStorageState,
  AskUserQuestionItem,
  AskUserQuestionAnswer,
} from '../agents/prompts';
import type { RuntimeAgentConfigurationOverrides } from '../agents/definition';
import type { RoundState } from './round_state';

/**
 * Represents the input that initiated a conversation round.
 */
export interface RoundInput {
  /**
   * A text message from the user.
   */
  message: string;
  /**
   * Optional attachments to provide to the agent.
   * @deprecated Use attachment_refs with conversation-level attachments instead
   */
  attachments?: Attachment[];
  /**
   * References to versioned conversation-level attachments.
   */
  attachment_refs?: AttachmentVersionRef[];
}

/**
 * Represents the input used to interact with an agent (new round, resume round)
 */
export interface ConverseInput {
  /**
   * A text message from the user.
   */
  message?: string;
  /**
   * Optional attachments to provide to the agent.
   * Use `origin` without `data` for by-reference types that implement `resolve`.
   * @deprecated Use attachment_refs with conversation-level attachments instead
   */
  attachments?: AttachmentInput[];
  /**
   * References to versioned conversation-level attachments.
   */
  attachment_refs?: AttachmentVersionRef[];
  /**
   * Response from the user to prompt requests.
   */
  prompts?: Record<string, PromptResponse>;
}

/**
 * Represents the final answer from the agent in a conversation round.
 */
export interface AssistantResponse {
  /**
   * The text message from the assistant.
   */
  message: string;
  structured_output?: object;
}

export enum ConversationRoundStepType {
  toolCall = 'tool_call',
  reasoning = 'reasoning',
  compaction = 'compaction',
  backgroundAgentComplete = 'background_agent_complete',
  updateTodos = 'update_todos',
  askUserQuestion = 'ask_user_question',
}

// tool call step

export type ConversationRoundStepMixin<TType extends ConversationRoundStepType, TData> = TData & {
  type: TType;
};

/**
 * Tool call progress which were emitted during the tool execution
 */
export interface ToolCallProgress {
  /**
   * The full text message
   */
  message: string;
  /**
   * Optional structured metadata attached to this progress event.
   */
  metadata?: Record<string, string>;
}

/**
 * Represents a tool call with the corresponding result.
 */
export interface ToolCallWithResult {
  /**
   * Id of the tool call, as returned by the LLM
   */
  tool_call_id: string;
  /**
   * Identifier of the tool.
   */
  tool_id: string;
  /**
   * Arguments the tool was called with.
   */
  params: Record<string, any>;
  /**
   * List of progress message which were send during that tool call
   */
  progression?: ToolCallProgress[];
  /**
   * Result of the tool
   */
  results: ToolResult[];
  /**
   * Optional group ID shared by tool calls that were executed in parallel from the same LLM response
   */
  tool_call_group_id?: string;
  tool_origin?: ToolOrigin;
  tool_type?: ToolType;
}

export type ToolCallStep = ConversationRoundStepMixin<
  ConversationRoundStepType.toolCall,
  ToolCallWithResult
>;

export const createToolCallStep = (toolCallWithResult: ToolCallWithResult): ToolCallStep => {
  return {
    type: ConversationRoundStepType.toolCall,
    ...toolCallWithResult,
  };
};

export const isToolCallStep = (step: ConversationRoundStep): step is ToolCallStep => {
  return step.type === ConversationRoundStepType.toolCall;
};

export const createReasoningStep = (reasoningStepWithResult: ReasoningStepData): ReasoningStep => {
  return {
    type: ConversationRoundStepType.reasoning,
    ...reasoningStepWithResult,
  };
};

export interface ReasoningStepData {
  /** plain text reasoning content */
  reasoning: string;
  /** if true, will not be displayed in the thinking panel, only used as "current thinking" **/
  transient?: boolean;
  /** when reasoning is bound to a tool call, the corresponding tool call ID */
  tool_call_id?: string;
  /** when reasoning is bound to a tool call group, the corresponding tool call group ID */
  tool_call_group_id?: string;
}

export type ReasoningStep = ConversationRoundStepMixin<
  ConversationRoundStepType.reasoning,
  ReasoningStepData
>;

export const isReasoningStep = (step: ConversationRoundStep): step is ReasoningStep => {
  return step.type === ConversationRoundStepType.reasoning;
};

/**
 * Defines all possible types for round steps.
 */
// compaction step

export interface CompactionStepData {
  /** Number of conversation rounds that were summarized into a compact form */
  summarized_round_count: number;
  /** Estimated token count of the conversation before compaction */
  token_count_before: number;
  /** Estimated token count of the conversation after compaction */
  token_count_after: number;
}

export type CompactionStep = ConversationRoundStepMixin<
  ConversationRoundStepType.compaction,
  CompactionStepData
>;

export const isCompactionStep = (step: ConversationRoundStep): step is CompactionStep => {
  return step.type === ConversationRoundStepType.compaction;
};

export type BackgroundAgentCompleteStep = ConversationRoundStepMixin<
  ConversationRoundStepType.backgroundAgentComplete,
  BackgroundExecutionState
>;

export const isBackgroundAgentCompleteStep = (
  step: ConversationRoundStep
): step is BackgroundAgentCompleteStep => {
  return step.type === ConversationRoundStepType.backgroundAgentComplete;
};

export interface TodosStepData {
  todos: TodoItem[];
  /** True when todos were inherited from the previous round, not written by the agent this round */
  carried_over?: boolean;
}

export type TodosStep = ConversationRoundStepMixin<
  ConversationRoundStepType.updateTodos,
  TodosStepData
>;

export const isTodosStep = (step: ConversationRoundStep): step is TodosStep => {
  return step.type === ConversationRoundStepType.updateTodos;
};

// ask_user_question step

export interface AskUserQuestionStepData {
  /** Id of the prompt that produced this step. Matches the entry in `state.prompt.responses` and the prompt request's `id`. */
  prompt_id: string;
  /** The questions presented to the user. */
  questions: AskUserQuestionItem[];
  /** Undefined while the step is pending; populated on resume back-fill. */
  answers?: AskUserQuestionAnswer[];
}

export type AskUserQuestionStep = ConversationRoundStepMixin<
  ConversationRoundStepType.askUserQuestion,
  AskUserQuestionStepData
>;

export const createAskUserQuestionStep = (data: AskUserQuestionStepData): AskUserQuestionStep => {
  return {
    type: ConversationRoundStepType.askUserQuestion,
    ...data,
  };
};

export const isAskUserQuestionStep = (step: ConversationRoundStep): step is AskUserQuestionStep => {
  return step.type === ConversationRoundStepType.askUserQuestion;
};

/**
 * Returns the (single) todos step from a list of steps, if present.
 * A round only ever has at most one todos step, which is updated in place.
 */
export const findTodosStep = (
  steps: ConversationRoundStep[] | undefined
): TodosStep | undefined => {
  return steps?.find(isTodosStep);
};

/**
 * Returns the todo list to carry over from the previous round, or undefined if nothing should carry over.
 * Carryover only happens when at least one item is still incomplete (pending / in_progress).
 * When carried over, both complete and incomplete items are included so the full plan is visible.
 */
export const carriedOverTodos = (todos: TodoItem[] | undefined): TodoItem[] | undefined => {
  if (!todos?.length) return undefined;
  const hasIncomplete = todos.some((t) => t.status !== 'completed' && t.status !== 'cancelled');
  return hasIncomplete ? todos : undefined;
};

export type ConversationRoundStep =
  | ToolCallStep
  | ReasoningStep
  | CompactionStep
  | BackgroundAgentCompleteStep
  | TodosStep
  | AskUserQuestionStep;

export enum ConversationRoundStatus {
  /** round is currently being processed */
  inProgress = 'in_progress',
  /** the round is completed */
  completed = 'completed',
  /** round has been interrupted and is awaiting user input */
  awaitingPrompt = 'awaiting_prompt',
}

/**
 * Frontend-only derived status for a conversation in the sidebar list.
 * Computed client-side from the backend `read` flag, `ConversationRoundStatus`,
 * and the active-streams map — never returned directly by any API endpoint.
 */
export enum ConversationDisplayStatus {
  /** conversation has been read, no pending activity */
  read = 'read',
  /** conversation has new content the user hasn't seen */
  unread = 'unread',
  /** agent is actively streaming a response */
  inProgress = 'in_progress',
  /** agent is paused and waiting for user confirmation (HITL) */
  awaitingPrompt = 'awaiting_prompt',
  /** last round ended with an error */
  error = 'error',
}

/**
 * Represents a round in a conversation, containing all the information
 * related to this particular round.
 */
export interface ConversationRound {
  /** unique id for this round */
  id: string;
  /** current status of the round */
  status: ConversationRoundStatus;
  /** persisted state to resume interrupted states */
  state?: RoundState;
  /** if status is awaiting_prompt, contains the current prompt requests */
  pending_prompts?: PromptRequest[];
  /** The user input that initiated the round */
  input: RoundInput;
  /** List of intermediate steps before the end result, such as tool calls */
  steps: ConversationRoundStep[];
  /** The final response from the assistant */
  response: AssistantResponse;
  /** when the round was started */
  started_at: string;
  /** time it took to first token, in ms */
  time_to_first_token: number;
  /** time it took to last token, in ms */
  time_to_last_token: number;
  /** Model Usage statistics for this round */
  model_usage: RoundModelUsageStats;
  /** when tracing is enabled, contains the traceId associated with this round */
  trace_id?: string | string[];
  /** Runtime configuration overrides that were applied to this round */
  configuration_overrides?: RuntimeAgentConfigurationOverrides;
}

export interface RoundModelUsageStats {
  /**
   * Id of the connector used for this round
   */
  connector_id: string;
  /**
   * Number of LLM calls which were done during this round.
   */
  llm_calls: number;
  /**
   * Total number of input tokens sent this round.
   */
  input_tokens: number;
  /**
   * Total number of output tokens received this round.
   */
  output_tokens: number;
  /**
   * Model identifier from the provider response, if available.
   */
  model?: string;
}

/**
 * Main structure representing a conversation with an agent.
 */
export interface Conversation {
  /** unique id for this conversation */
  id: string;
  /** id of the agent this conversation is bound to */
  agent_id: string;
  /** info of the owner of the discussion */
  user: UserIdAndName;
  /** title of the conversation */
  title: string;
  /** creation date */
  created_at: string;
  /** update date */
  updated_at: string;
  /** list of round for this conversation */
  rounds: ConversationRound[];
  /**
   * Conversation-level versioned attachments.
   * These attachments are shared across all rounds and can be referenced via attachment_refs.
   */
  attachments?: VersionedAttachment[];
  /**
   * Internal representation of the prompt storage state for the conversation.
   * Keeps track of which prompts have been answered and the response.
   */
  state?: ConversationInternalState;
  /**
   * Whether the conversation has been marked as read.
   * Any new or updated conversation has `read` set to `false` by default
   */
  read?: boolean;
  /** current status of the conversation */
  status?: ConversationRoundStatus;
  /**
   * Identifier of the bash/VFS workspace for this conversation.
   */
  workspace_id?: string;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

/**
 * Internal storage for the conversation's arbitrary state.
 * Used for example to keep track of the prompt responses.
 */
export interface ConversationInternalState {
  prompt?: PromptStorageState;
  /**
   * Dynamic tool IDs that were added during conversation rounds.
   * These tools are persisted across rounds so they remain available.
   */
  dynamic_tool_ids?: string[];
  /**
   * Summary of compacted older conversation rounds.
   * Generated when the conversation approaches the model's context window limit.
   * Reused across rounds until regeneration is needed.
   */
  compaction_summary?: CompactionSummary;
  /** Background sub-agent executions keyed by execution ID. */
  background_executions?: Record<string, BackgroundExecutionState>;
  /** Active todo list for the current conversation. Replaced wholesale on each write. */
  todos?: TodoItem[];
}

export interface BackgroundExecutionCompletedAt {
  /** The round it was completed at. */
  round_id: string;
  /** If completion was resolved inside a round, the last tool call group ID before completion. */
  tool_call_group_id?: string;
}

export interface BackgroundExecutionState {
  /** The execution ID of the background sub-agent. */
  execution_id: string;
  /** Current status of the execution. */
  status: ExecutionStatus;
  /** The sub-agent's response, present when status is 'completed'. */
  response?: AssistantResponse;
  /** Error details, present when status is 'failed'. */
  error?: SerializedExecutionError;
  /** When and where the execution completed, for positioning the notification. */
  completed_at?: BackgroundExecutionCompletedAt;
}

export type ConversationWithoutRounds = Omit<Conversation, 'rounds'>;

export type ConversationAction = 'regenerate';

// Compaction summary types

/** Compact representation of a tool call in a compaction summary */
export interface CompactionToolCallSummary {
  tool_id: string;
  /** Short stringified summary of the params the tool was called with */
  params_summary: string;
}

/** Structured entity extracted during compaction */
export interface CompactionEntity {
  type: string;
  name: string;
}

/**
 * Structured data produced by the compaction pipeline.
 * Semantic fields (discussion_summary, user_intent, key_topics,
 * outcomes_and_decisions, unanswered_questions, entities) are LLM-generated.
 * Deterministic fields (tool_calls_summary, agent_actions)
 * are extracted programmatically from the round data.
 */
export interface CompactionStructuredData {
  discussion_summary: string;
  user_intent: string;
  key_topics: string[];
  outcomes_and_decisions: string[];
  agent_actions: string[];
  entities: CompactionEntity[];
  unanswered_questions: string[];
  tool_calls_summary: CompactionToolCallSummary[];
}

/**
 * Summary of compacted conversation rounds.
 * Stored at the conversation level and reused across rounds
 * until the context window fills up again and regeneration is needed.
 */
export interface CompactionSummary {
  /** Number of rounds that were summarized */
  summarized_round_count: number;
  /** When the summary was generated */
  created_at: string;
  /** Estimated token count of the serialized summary */
  token_count: number;
  /** Structured summary data */
  structured_data: CompactionStructuredData;
}

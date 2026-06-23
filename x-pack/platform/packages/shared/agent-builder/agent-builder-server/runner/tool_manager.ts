/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { StructuredTool } from '@langchain/core/tools';
import type { BrowserApiToolMetadata, ToolOrigin, ToolType } from '@kbn/agent-builder-common';
import type { Logger } from '@kbn/logging';
import type { ToolReturnSummarizerFn } from '../tools/builtin';
import type { AgentEventEmitterFn, ExecutableTool } from '..';

export interface ToolManagerParams {
  dynamicToolCapacity: number;
}

export type ToolName = string;

export interface AddToolOptions {
  dynamic?: boolean;
}

export type ExecutableToolWithOrigin = ExecutableTool & { origin: ToolOrigin };
export type BrowserToolWithOrigin = BrowserApiToolMetadata & { origin: ToolOrigin };

export enum ToolManagerToolType {
  executable = 'executable',
  browser = 'browser',
}

export interface ExecutableToolInput {
  type: ToolManagerToolType.executable;
  tools: ExecutableToolWithOrigin | ExecutableToolWithOrigin[];
  logger: Logger;
}

export interface BrowserToolInput {
  type: ToolManagerToolType.browser;
  tools: BrowserToolWithOrigin | BrowserToolWithOrigin[];
}

export type AddToolInput = ExecutableToolInput | BrowserToolInput;

/**
 * Interface for managing tools in the agent system.
 * Handles both static and dynamic tools with LRU eviction for dynamic tools.
 */
export interface ToolManager {
  /**
   * Sets the event emitter to use for all tools added to this manager.
   * Should be called once per run before adding tools.
   */
  setEventEmitter(eventEmitter: AgentEventEmitterFn): void;

  /**
   * Adds tools to the tool manager.
   * Supports both executable tools and browser API tools.
   * @param input - The tool input configuration (executable or browser)
   * @param options - Optional configuration for tool storage (static vs dynamic)
   */
  addTools(input: AddToolInput, options?: AddToolOptions): Promise<void>;

  /**
   * Lists all tools in the tool manager.
   * @returns an array of all tools (static and dynamic)
   */
  list(): StructuredTool[];

  /**
   * Records the use of a tool, marking it as recently used.
   * This affects LRU eviction for dynamic tools.
   * @param name - the name of the tool to record usage for
   */
  recordToolUse(langchainToolName: ToolName): void;

  /**
   * Gets the tool id mapping.
   * Maps LangChain tool names to internal tool IDs.
   * @returns the tool id mapping
   */
  getToolIdMapping(): Map<string, string>;

  getToolMeta(toolId: string): { origin: ToolOrigin | undefined; type: ToolType | undefined };

  /**
   * Returns the resolved executable tool for the given internal id, or `undefined`
   * if no such tool was registered for this run. Use with `Runner.runInternalTool`
   * to dispatch a tool from outside the LangChain graph (e.g. `exec_tool` in bash)
   * while still going through the standard hooks/telemetry pipeline.
   */
  getExecutable(toolId: string): ExecutableTool | undefined;

  /**
   * Gets the internal tool IDs of all dynamic tools currently in the tool manager.
   * Returns internal tool IDs (not LangChain names) for persistence.
   * @returns array of internal tool IDs
   */
  getDynamicToolIds(): string[];

  /**
   * Gets the summarizer function for a tool by its internal tool ID.
   * Returns undefined if the tool is not found or has no summarizer.
   */
  getSummarizer(toolId: string): ToolReturnSummarizerFn | undefined;
}

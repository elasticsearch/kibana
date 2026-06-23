/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolResult } from '@kbn/agent-builder-common/tools';
import type { FileEntryAccessor } from './file_entry_accessor';

/**
 * Store to access tool results during execution. Extends `FileEntryAccessor`
 * so callers that need per-result file-level metadata (e.g. `token_count`)
 * can read it without going through the byte-level `IFileSystem`.
 */
export interface ToolResultStore extends FileEntryAccessor {
  has(resultId: string): boolean;
  get(resultId: string): ToolResult;
}

/**
 * Writable version of ToolResultStore, used internally by the runner/agent
 */
export interface WritableToolResultStore extends ToolResultStore {
  add(result: ToolResultWithMeta): void;
  delete(resultId: string): boolean;
  asReadonly(): ToolResultStore;
}

export interface ToolResultWithMeta {
  tool_call_id: string;
  tool_id: string;
  result: ToolResult;
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Conversation, ToolResult } from '@kbn/agent-builder-common';
import type {
  ToolResultStore,
  WritableToolResultStore,
  ToolResultWithMeta,
} from '@kbn/agent-builder-server/runner';
import { MemoryVolume } from '../../memory_volume';
import { extractConversationToolResults, createToolCallEntry, getToolCallEntryPath } from './utils';

export const createResultStore = ({ conversation }: { conversation?: Conversation }) => {
  const toolResults = extractConversationToolResults(conversation?.rounds ?? []);
  return new ToolResultStoreImpl({ toolResults });
};

export class ToolResultStoreImpl implements WritableToolResultStore {
  private readonly results: Map<string, ToolResultWithMeta> = new Map();
  private readonly volume: MemoryVolume;

  constructor({ toolResults = [] }: { toolResults?: ToolResultWithMeta[] }) {
    this.volume = new MemoryVolume();
    toolResults.forEach((result) => this.add(result));
  }

  add(result: ToolResultWithMeta): void {
    this.results.set(result.result.tool_result_id, result);
    // Also add to the volume for filesystem access
    const entry = createToolCallEntry(result);
    this.volume.add(entry);
  }

  delete(resultId: string): boolean {
    const result = this.results.get(resultId);
    if (result) {
      const path = getToolCallEntryPath({
        toolId: result.tool_id,
        toolCallId: result.tool_call_id,
        toolResultId: result.result.tool_result_id,
      });
      this.volume.remove(path);
    }
    return this.results.delete(resultId);
  }

  has(resultId: string): boolean {
    return this.results.has(resultId);
  }

  get(resultId: string): ToolResult {
    if (!this.results.has(resultId)) {
      throw new Error(`Result with id ${resultId} does not exist`);
    }
    return this.results.get(resultId)!.result;
  }

  async getEntry(path: string) {
    return this.volume.get(path);
  }
  async listEntries(dirPath: string) {
    return this.volume.list(dirPath);
  }
  async entryExists(path: string) {
    return this.volume.exists(path);
  }

  asReadonly(): ToolResultStore {
    return {
      has: (resultId) => this.has(resultId),
      get: (resultId) => this.get(resultId),
      getEntry: (path) => this.getEntry(path),
      listEntries: (dirPath) => this.listEntries(dirPath),
      entryExists: (path) => this.entryExists(path),
    };
  }
}

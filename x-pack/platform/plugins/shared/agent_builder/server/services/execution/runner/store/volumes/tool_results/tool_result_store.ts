/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Conversation, ToolCallWithResult, ToolResult } from '@kbn/agent-builder-common';
import type {
  ToolResultStore,
  WritableToolResultStore,
  ToolResultWithMeta,
} from '@kbn/agent-builder-server/runner';
import { MemoryVolume } from '../../memory_volume';
import { extractConversationToolResults, buildToolCallEntries } from './utils';

export const createResultStore = ({ conversation }: { conversation?: Conversation }) => {
  const toolCalls = extractConversationToolResults(conversation?.rounds ?? []);
  return new ToolResultStoreImpl({ toolCalls });
};

export class ToolResultStoreImpl implements WritableToolResultStore {
  private readonly results: Map<string, ToolResultWithMeta> = new Map();
  private readonly resultIdToPath: Map<string, string> = new Map();
  private readonly volume: MemoryVolume;

  constructor({ toolCalls = [] }: { toolCalls?: ToolCallWithResult[] }) {
    this.volume = new MemoryVolume();
    toolCalls.forEach((toolCall) => this.add(toolCall));
  }

  add(toolCall: ToolCallWithResult): void {
    const { metaEntry, resultEntries } = buildToolCallEntries(toolCall);
    this.volume.add(metaEntry);
    for (const { entry, result, relativePath } of resultEntries) {
      this.results.set(result.tool_result_id, {
        tool_call_id: toolCall.tool_call_id,
        tool_id: toolCall.tool_id,
        result,
      });
      this.resultIdToPath.set(result.tool_result_id, relativePath);
      this.volume.add(entry);
    }
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

  async getEntryByResultId(toolResultId: string) {
    const relativePath = this.resultIdToPath.get(toolResultId);
    if (!relativePath) {
      return undefined;
    }
    return this.volume.get(relativePath);
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
      getEntryByResultId: (resultId) => this.getEntryByResultId(resultId),
      listEntries: (dirPath) => this.listEntries(dirPath),
      entryExists: (path) => this.entryExists(path),
    };
  }
}

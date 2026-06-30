/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FileEntry } from '@kbn/agent-builder-server/runner/filestore';

export type ToolCallFileEntry<TData extends object = object> = FileEntry<TData>;

/**
 * Content of a tool call's `meta.json` file.
 */
export interface ToolCallMetaContent {
  tool_call_id: string;
  tool_id: string;
  params: Record<string, unknown>;
  results: ToolCallResultManifestEntry[];
}

/**
 * One entry of the `meta.json` results manifest
 */
export interface ToolCallResultManifestEntry {
  file: string;
  type: string;
  tool_result_id: string;
}

export type ToolCallMetaFileEntry = FileEntry<ToolCallMetaContent>;

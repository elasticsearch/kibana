/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Persistent representation of a single file in a workspace.
 * Content is base64-encoded so binary data round-trips safely.
 */
export interface WorkspaceFile {
  content: string; // base64-encoded bytes
  mode: number;
  mtime: string; // ISO 8601
}

/**
 * Public-facing view of a loaded workspace
 */
export interface WorkspaceSnapshot {
  files: Record<string, WorkspaceFile>;
}

/**
 * Internal — the ES document shape persisted in the workspaces index.
 * `files` keys are absolute paths within `/workspace` (e.g. `/workspace/notes.txt`).
 */
export interface WorkspaceDocument {
  workspace_id: string;
  space: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
  files: Record<string, WorkspaceFile>;
}

export const WORKSPACE_SCHEMA_VERSION = 1;

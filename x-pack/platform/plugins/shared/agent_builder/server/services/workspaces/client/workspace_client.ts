/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createSpaceDslFilter } from '../../../utils/spaces';
import type { WorkspaceStorage } from './storage';
import {
  WORKSPACE_SCHEMA_VERSION,
  type WorkspaceDocument,
  type WorkspaceFile,
  type WorkspaceSnapshot,
} from '../types';

export interface IWorkspaceClient {
  load(workspaceId: string): Promise<WorkspaceSnapshot | undefined>;
  save(workspaceId: string, files: Record<string, WorkspaceFile>): Promise<void>;
}

export class WorkspaceClient implements IWorkspaceClient {
  private readonly storage: WorkspaceStorage;
  private readonly space: string;

  constructor({ storage, space }: { storage: WorkspaceStorage; space: string }) {
    this.storage = storage;
    this.space = space;
  }

  async load(workspaceId: string): Promise<WorkspaceSnapshot | undefined> {
    const doc = await this.loadDocument(workspaceId);
    if (!doc) return undefined;
    return { files: doc.files };
  }

  async save(workspaceId: string, files: Record<string, WorkspaceFile>): Promise<void> {
    const now = new Date().toISOString();
    const existing = await this.loadDocument(workspaceId);
    const document: WorkspaceDocument = {
      workspace_id: workspaceId,
      space: this.space,
      schema_version: WORKSPACE_SCHEMA_VERSION,
      created_at: existing?.created_at ?? now,
      updated_at: now,
      files,
    };
    await this.storage.getClient().index({ id: workspaceId, document });
  }

  /** Internal — full document fetch including metadata. */
  private async loadDocument(workspaceId: string): Promise<WorkspaceDocument | undefined> {
    const response = await this.storage.getClient().search({
      track_total_hits: false,
      size: 1,
      terminate_after: 1,
      query: {
        bool: {
          filter: [createSpaceDslFilter(this.space), { term: { _id: workspaceId } }],
        },
      },
    });
    if (response.hits.hits.length === 0) return undefined;
    return response.hits.hits[0]._source as WorkspaceDocument | undefined;
  }
}

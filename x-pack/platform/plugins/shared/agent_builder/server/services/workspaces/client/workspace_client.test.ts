/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { WorkspaceStorage } from './storage';
import { WorkspaceClient } from './workspace_client';
import { WORKSPACE_SCHEMA_VERSION, type WorkspaceDocument, type WorkspaceFile } from '../types';

const createMockStorage = () => {
  const search = jest.fn();
  const index = jest.fn();
  const client = { search, index };
  const storage = {
    getClient: jest.fn().mockReturnValue(client),
  } as unknown as WorkspaceStorage;
  return { storage, search, index };
};

const mockHit = (doc: WorkspaceDocument) => ({ hits: { hits: [{ _source: doc }] } });
const mockEmpty = () => ({ hits: { hits: [] } });

const SAMPLE_FILES: Record<string, WorkspaceFile> = {
  '/workspace/a.txt': {
    content: 'aGVsbG8=',
    mode: 0o644,
    mtime: '2025-01-01T00:00:00.000Z',
  },
};

const sampleDoc = (overrides: Partial<WorkspaceDocument> = {}): WorkspaceDocument => ({
  workspace_id: 'ws-1',
  space: 'default',
  schema_version: WORKSPACE_SCHEMA_VERSION,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  files: SAMPLE_FILES,
  ...overrides,
});

describe('WorkspaceClient', () => {
  describe('load', () => {
    it('returns the workspace snapshot when the document exists', async () => {
      const { storage, search } = createMockStorage();
      search.mockResolvedValue(mockHit(sampleDoc()));
      const client = new WorkspaceClient({ storage, space: 'default' });
      expect(await client.load('ws-1')).toEqual({ files: SAMPLE_FILES });
    });

    it('searches by _id AND space (so workspaces from other spaces are invisible)', async () => {
      const { storage, search } = createMockStorage();
      search.mockResolvedValue(mockEmpty());
      const client = new WorkspaceClient({ storage, space: 'team-a' });
      await client.load('ws-other-space');

      expect(search).toHaveBeenCalledTimes(1);
      const arg = search.mock.calls[0][0];
      const filters = arg.query.bool.filter as Array<Record<string, unknown>>;
      // One filter is the id term, one is the space filter (shape varies for
      // default vs non-default — we just assert both ingredients are present).
      expect(filters).toEqual(
        expect.arrayContaining([expect.objectContaining({ term: { _id: 'ws-other-space' } })])
      );
      // For a non-default space the filter is a simple term; verify it's there.
      const flat = JSON.stringify(filters);
      expect(flat).toContain('team-a');
    });

    it('returns undefined when the search yields no hits', async () => {
      const { storage, search } = createMockStorage();
      search.mockResolvedValue(mockEmpty());
      const client = new WorkspaceClient({ storage, space: 'default' });
      expect(await client.load('missing')).toBeUndefined();
    });

    it('rethrows search errors', async () => {
      const { storage, search } = createMockStorage();
      search.mockRejectedValue(new Error('boom'));
      const client = new WorkspaceClient({ storage, space: 'default' });
      await expect(client.load('any')).rejects.toThrow(/boom/);
    });
  });

  describe('save', () => {
    it('writes space, schema_version, files, and timestamps', async () => {
      const { storage, search, index } = createMockStorage();
      search.mockResolvedValue(mockEmpty());
      const client = new WorkspaceClient({ storage, space: 'team-a' });

      await client.save('ws-2', SAMPLE_FILES);

      expect(index).toHaveBeenCalledTimes(1);
      const arg = index.mock.calls[0][0];
      expect(arg.id).toBe('ws-2');
      expect(arg.document.workspace_id).toBe('ws-2');
      expect(arg.document.space).toBe('team-a');
      expect(arg.document.schema_version).toBe(WORKSPACE_SCHEMA_VERSION);
      expect(arg.document.files).toEqual(SAMPLE_FILES);
      expect(typeof arg.document.updated_at).toBe('string');
      expect(typeof arg.document.created_at).toBe('string');
    });

    it('preserves created_at on subsequent saves', async () => {
      const { storage, search, index } = createMockStorage();
      const originalCreated = '2024-12-25T00:00:00.000Z';
      search.mockResolvedValue(mockHit(sampleDoc({ created_at: originalCreated })));
      const client = new WorkspaceClient({ storage, space: 'default' });

      await client.save('ws-3', {});

      const arg = index.mock.calls[0][0];
      expect(arg.document.created_at).toBe(originalCreated);
      expect(arg.document.updated_at).not.toBe(originalCreated);
    });
  });
});

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IWorkspaceClient, WorkspaceFile, WorkspaceSnapshot } from '../../workspaces';
import { WorkspaceVolume } from './workspace_volume';

const mockWorkspaceClient = (): jest.Mocked<IWorkspaceClient> => ({
  load: jest.fn().mockResolvedValue(undefined),
  save: jest.fn().mockResolvedValue(undefined),
});

const persistedDoc = (files: Record<string, WorkspaceFile>): WorkspaceSnapshot => ({ files });

describe('WorkspaceVolume', () => {
  describe('getOrCreateWorkspaceId', () => {
    it('returns the existing id when one is set', () => {
      const v = new WorkspaceVolume({
        workspaceClient: mockWorkspaceClient(),
        initialWorkspaceId: 'existing',
      });
      expect(v.getOrCreateWorkspaceId()).toBe('existing');
      expect(v.getWorkspaceId()).toBe('existing');
    });

    it('mints a new UUID when none is provided, and reuses it', () => {
      const v = new WorkspaceVolume({ workspaceClient: mockWorkspaceClient() });
      const first = v.getOrCreateWorkspaceId();
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(v.getOrCreateWorkspaceId()).toBe(first);
      expect(v.getWorkspaceId()).toBe(first);
    });

    it('uses the test override for id generation when provided', () => {
      const v = new WorkspaceVolume({
        workspaceClient: mockWorkspaceClient(),
        generateId: () => 'fixed',
      });
      expect(v.getOrCreateWorkspaceId()).toBe('fixed');
    });
  });

  describe('load', () => {
    it('is a no-op when no workspaceId is set', async () => {
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({ workspaceClient: client });
      await v.load();
      expect(client.load).not.toHaveBeenCalled();
    });

    it('populates the in-memory FS from the persisted document', async () => {
      const client = mockWorkspaceClient();
      client.load.mockResolvedValueOnce(
        persistedDoc({
          '/workspace/notes.txt': {
            content: Buffer.from('hi').toString('base64'),
            mode: 0o644,
            mtime: '2025-01-01T00:00:00.000Z',
          },
        })
      );
      const v = new WorkspaceVolume({ workspaceClient: client, initialWorkspaceId: 'ws-test' });
      await v.load();
      const fs = v.getFilesystem();
      expect(await fs.readFile('/notes.txt')).toBe('hi');
    });

    it('is idempotent — subsequent load() calls are no-ops', async () => {
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({ workspaceClient: client, initialWorkspaceId: 'ws-test' });
      await v.load();
      await v.load();
      expect(client.load).toHaveBeenCalledTimes(1);
    });
  });

  describe('snapshot', () => {
    it('returns {} for an empty workspace', async () => {
      const v = new WorkspaceVolume({ workspaceClient: mockWorkspaceClient() });
      expect(await v.snapshot()).toEqual({});
    });

    it('serializes nested files with base64 content + mode + mtime', async () => {
      const v = new WorkspaceVolume({ workspaceClient: mockWorkspaceClient() });
      const fs = v.getFilesystem();
      await fs.writeFile('/a.txt', 'alpha');
      await fs.mkdir('/sub', { recursive: true });
      await fs.writeFile('/sub/b.txt', 'beta');

      const snapshot = await v.snapshot();
      expect(Object.keys(snapshot).sort()).toEqual(['/workspace/a.txt', '/workspace/sub/b.txt']);
      expect(Buffer.from(snapshot['/workspace/a.txt'].content, 'base64').toString()).toBe('alpha');
      expect(Buffer.from(snapshot['/workspace/sub/b.txt'].content, 'base64').toString()).toBe(
        'beta'
      );
      expect(typeof snapshot['/workspace/a.txt'].mode).toBe('number');
      expect(typeof snapshot['/workspace/a.txt'].mtime).toBe('string');
    });
  });

  describe('capacity cap', () => {
    it('writes through getFilesystem() throw ENOSPC when the cap is exceeded', async () => {
      const v = new WorkspaceVolume({
        workspaceClient: mockWorkspaceClient(),
        capacityBytes: 50,
      });
      const fs = v.getFilesystem();
      await fs.writeFile('/note.txt', 'x'.repeat(40));
      await expect(fs.writeFile('/big.txt', 'y'.repeat(20))).rejects.toThrow(/ENOSPC/);
    });

    it('load() bypasses the cap (restoring persisted state)', async () => {
      const client = mockWorkspaceClient();
      // Persisted content is 60 bytes — would violate a 50-byte cap if it
      // went through the wrapper. load() should restore it regardless.
      client.load.mockResolvedValueOnce(
        persistedDoc({
          '/workspace/big.txt': {
            content: Buffer.from('x'.repeat(60)).toString('base64'),
            mode: 0o644,
            mtime: '2025-01-01T00:00:00.000Z',
          },
        })
      );
      const v = new WorkspaceVolume({
        workspaceClient: client,
        initialWorkspaceId: 'ws-test',
        capacityBytes: 50,
      });
      await v.load();
      // Persisted file is there; new agent writes are still capped.
      expect((await v.getFilesystem().readFile('/big.txt')).length).toBe(60);
      await expect(v.getFilesystem().writeFile('/more.txt', 'y')).rejects.toThrow(/ENOSPC/);
    });
  });

  describe('flush', () => {
    it('is a no-op when no workspaceId is set', async () => {
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({ workspaceClient: client });
      await v.flush();
      expect(client.save).not.toHaveBeenCalled();
    });

    it('is a no-op when nothing has changed since construction', async () => {
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({
        workspaceClient: client,
        initialWorkspaceId: 'ws-clean',
      });
      // No writes through getFilesystem() — dirty=false.
      await v.flush();
      expect(client.save).not.toHaveBeenCalled();
    });

    it('saves the snapshot after a write', async () => {
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({
        workspaceClient: client,
        initialWorkspaceId: 'ws-save',
      });
      await v.getFilesystem().writeFile('/file.txt', 'data');
      await v.flush();
      expect(client.save).toHaveBeenCalledTimes(1);
      const [wsId, files] = client.save.mock.calls[0];
      expect(wsId).toBe('ws-save');
      expect(Buffer.from(files['/workspace/file.txt'].content, 'base64').toString()).toBe('data');
    });

    it('skips the ES write when the workspace is empty and no doc exists yet', async () => {
      // Mutate so dirty=true, but the final snapshot is empty AND no prior doc.
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({
        workspaceClient: client,
        initialWorkspaceId: 'ws-empty',
      });
      await v.getFilesystem().writeFile('/scratch.txt', 'tmp');
      await v.getFilesystem().rm('/scratch.txt');
      await v.flush();
      expect(client.save).not.toHaveBeenCalled();
    });

    it('saves an empty workspace after deleting persisted content (records the delete)', async () => {
      const client = mockWorkspaceClient();
      client.load.mockResolvedValue(
        persistedDoc({
          '/workspace/old.txt': {
            content: Buffer.from('legacy').toString('base64'),
            mode: 0o644,
            mtime: '2025-01-01T00:00:00.000Z',
          },
        })
      );
      const v = new WorkspaceVolume({
        workspaceClient: client,
        initialWorkspaceId: 'ws-delete',
      });
      await v.load();
      // Delete the only file via the public (dirty-tracked) fs.
      await v.getFilesystem().rm('/old.txt');
      await v.flush();
      expect(client.save).toHaveBeenCalledTimes(1);
      const [, files] = client.save.mock.calls[0];
      expect(files).toEqual({});
    });

    it('resets dirty after a successful save (subsequent unchanged flush is a no-op)', async () => {
      const client = mockWorkspaceClient();
      const v = new WorkspaceVolume({
        workspaceClient: client,
        initialWorkspaceId: 'ws-double-flush',
      });
      await v.getFilesystem().writeFile('/a.txt', 'a');
      await v.flush();
      expect(client.save).toHaveBeenCalledTimes(1);
      // Second flush with no further changes should not call save again.
      await v.flush();
      expect(client.save).toHaveBeenCalledTimes(1);
    });
  });
});

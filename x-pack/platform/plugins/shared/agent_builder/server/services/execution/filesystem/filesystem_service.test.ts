/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MemoryVolume } from '../runner/store/memory_volume';
import { FilesystemService } from './filesystem_service';
import { WorkspaceVolume } from './workspace_volume';
import type { IWorkspaceClient } from '../../workspaces';

const mockWorkspaceClient = (): jest.Mocked<IWorkspaceClient> => ({
  load: jest.fn().mockResolvedValue(undefined),
  save: jest.fn().mockResolvedValue(undefined),
});

const makeService = (workspaceClient: IWorkspaceClient, opts?: { workspaceId?: string }) => {
  const workspaceVolume = new WorkspaceVolume({
    workspaceClient,
    initialWorkspaceId: opts?.workspaceId,
  });
  const service = new FilesystemService({
    workspaceVolume,
    toolResultsSource: new MemoryVolume(),
    skillsSource: new MemoryVolume(),
  });
  return { service, workspaceVolume };
};

describe('FilesystemService', () => {
  let workspaceClient: jest.Mocked<IWorkspaceClient>;

  beforeEach(() => {
    workspaceClient = mockWorkspaceClient();
  });

  it('exposes /workspace and /tmp after init', async () => {
    const { service } = makeService(workspaceClient);
    await service.init();
    const fs = service.getFilesystem();
    expect(await fs.exists('/workspace')).toBe(true);
    expect(await fs.exists('/tmp')).toBe(true);
  });

  it('writes to /workspace land in the workspace mount', async () => {
    const { service } = makeService(workspaceClient);
    await service.init();
    const fs = service.getFilesystem();
    await fs.writeFile('/workspace/note.txt', 'hi');
    expect(await fs.readFile('/workspace/note.txt')).toBe('hi');
  });

  it('writes to /tool_calls throw EROFS', async () => {
    const { service } = makeService(workspaceClient);
    await service.init();
    const fs = service.getFilesystem();
    await expect(fs.writeFile('/tool_calls/x', 'y')).rejects.toThrow(/EROFS/);
  });

  it('loads persisted workspace files on init when workspaceId is set', async () => {
    workspaceClient.load.mockResolvedValueOnce({
      files: {
        '/workspace/persisted.txt': {
          content: Buffer.from('saved').toString('base64'),
          mode: 0o644,
          mtime: '2025-01-01T00:00:00.000Z',
        },
      },
    });

    const { service } = makeService(workspaceClient, { workspaceId: 'ws-1' });
    await service.init();
    const fs = service.getFilesystem();
    expect(await fs.readFile('/workspace/persisted.txt')).toBe('saved');
  });

  it('does not call WorkspaceClient.load when no workspaceId is provided', async () => {
    const { service } = makeService(workspaceClient);
    await service.init();
    expect(workspaceClient.load).not.toHaveBeenCalled();
  });
});

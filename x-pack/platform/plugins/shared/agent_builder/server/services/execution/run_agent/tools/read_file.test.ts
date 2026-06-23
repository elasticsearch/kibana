/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createReadFileTool } from './read_file';
import { FilesystemService } from '../../filesystem/filesystem_service';
import { WorkspaceVolume } from '../../filesystem/workspace_volume';
import { MemoryVolume } from '../../runner/store/memory_volume';
import type { IWorkspaceClient } from '../../../workspaces';

const makeService = async () => {
  const workspaceClient: jest.Mocked<IWorkspaceClient> = {
    load: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const workspaceVolume = new WorkspaceVolume({ workspaceClient });
  const service = new FilesystemService({
    workspaceVolume,
    toolResultsSource: new MemoryVolume(),
    skillsSource: new MemoryVolume(),
  });
  await service.init();
  return service;
};

interface StandardReturn {
  results: Array<{ type: string; data: { content?: string; path?: string; truncated?: boolean } }>;
}

describe('read_file', () => {
  it('reads workspace files', async () => {
    const service = await makeService();
    await service.getFilesystem().writeFile('/workspace/note.txt', 'hi there');
    const tool = createReadFileTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/note.txt' },
      {} as never
    )) as StandardReturn;
    expect(out.results[0].data.content).toBe('hi there');
    expect(out.results[0].data.path).toBe('/workspace/note.txt');
    expect(out.results[0].data.truncated).toBeUndefined();
  });

  it('returns an error result when the path is missing', async () => {
    const service = await makeService();
    const tool = createReadFileTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/missing.txt' },
      {} as never
    )) as StandardReturn;
    expect(out.results[0].type).toBe('error');
  });

  it('truncates very large file contents', async () => {
    const service = await makeService();
    await service.getFilesystem().writeFile('/workspace/huge.txt', 'x'.repeat(200_000));
    const tool = createReadFileTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/huge.txt' },
      {} as never
    )) as StandardReturn;
    expect(out.results[0].data.truncated).toBe(true);
  });
});

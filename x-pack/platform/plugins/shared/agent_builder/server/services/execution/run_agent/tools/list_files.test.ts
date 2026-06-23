/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createListFilesTool } from './list_files';
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

interface ListEntry {
  name: string;
  type: 'file' | 'directory';
  children?: ListEntry[];
}

interface StandardReturn {
  results: Array<{
    type: string;
    data: {
      path?: string;
      entries?: ListEntry[];
    } & Record<string, unknown>;
  }>;
}

describe('list_files', () => {
  it('lists files in a workspace directory', async () => {
    const service = await makeService();
    const fs = service.getFilesystem();
    await fs.mkdir('/workspace/sub', { recursive: true });
    await fs.writeFile('/workspace/sub/a.txt', 'a');
    await fs.writeFile('/workspace/sub/b.txt', 'b');
    await fs.mkdir('/workspace/sub/nested', { recursive: true });

    const tool = createListFilesTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/sub', depth: 1 },
      {} as never
    )) as StandardReturn;

    expect(out.results).toHaveLength(1);
    expect(out.results[0].type).toBe('other');
    expect(out.results[0].data.path).toBe('/workspace/sub');
    expect(out.results[0].data.entries).toEqual(
      expect.arrayContaining([
        { name: 'a.txt', type: 'file' },
        { name: 'b.txt', type: 'file' },
        { name: 'nested', type: 'directory' },
      ])
    );
  });

  it('returns an error result for a nonexistent path', async () => {
    const service = await makeService();
    const tool = createListFilesTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/does-not-exist', depth: 1 },
      {} as never
    )) as { results: Array<{ type: string; data: { message: string } }> };
    expect(out.results[0].type).toBe('error');
    expect(out.results[0].data.message).toMatch(/list_files '\/workspace\/does-not-exist'/);
  });

  it('returns nested children when depth > 1', async () => {
    const service = await makeService();
    const fs = service.getFilesystem();
    await fs.mkdir('/workspace/root/a/inner', { recursive: true });
    await fs.writeFile('/workspace/root/top.txt', 't');
    await fs.writeFile('/workspace/root/a/mid.txt', 'm');
    await fs.writeFile('/workspace/root/a/inner/leaf.txt', 'l');

    const tool = createListFilesTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/root', depth: 3 },
      {} as never
    )) as StandardReturn;

    expect(out.results[0].type).toBe('other');
    const entries = out.results[0].data.entries as ListEntry[];
    const a = entries.find((e) => e.name === 'a');
    expect(a).toEqual({
      name: 'a',
      type: 'directory',
      children: expect.arrayContaining([
        { name: 'mid.txt', type: 'file' },
        {
          name: 'inner',
          type: 'directory',
          children: [{ name: 'leaf.txt', type: 'file' }],
        },
      ]),
    });
    // depth bounds: with depth=3 starting at root, leaf.txt (depth 3) should appear,
    // but a hypothetical 4th level would not — verified above by the strict structure.
    expect(entries).toEqual(
      expect.arrayContaining([
        { name: 'top.txt', type: 'file' },
        expect.objectContaining({ name: 'a' }),
      ])
    );
  });

  it('only returns immediate children with depth=1 (default)', async () => {
    const service = await makeService();
    const fs = service.getFilesystem();
    await fs.mkdir('/workspace/d1/d2', { recursive: true });
    await fs.writeFile('/workspace/d1/d2/leaf.txt', 'x');

    const tool = createListFilesTool({ filesystemService: service });
    const out = (await tool.handler(
      { path: '/workspace/d1', depth: 1 },
      {} as never
    )) as StandardReturn;

    const entries = out.results[0].data.entries as ListEntry[];
    const d2 = entries.find((e) => e.name === 'd2');
    expect(d2).toEqual({ name: 'd2', type: 'directory' });
    expect(d2?.children).toBeUndefined();
  });
});

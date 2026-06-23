/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BashService } from './bash_service';
import { FilesystemService } from '../../filesystem/filesystem_service';
import { WorkspaceVolume } from '../../filesystem/workspace_volume';
import { MemoryVolume } from '../../runner/store/memory_volume';
import type { IWorkspaceClient } from '../../../workspaces';
import { SAFEGUARD_TOKEN_COUNT } from './output_truncation';

const makeFixture = async (opts?: { workspaceId?: string; generateId?: () => string }) => {
  const workspaceClient: jest.Mocked<IWorkspaceClient> = {
    load: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };
  const workspaceVolume = new WorkspaceVolume({
    workspaceClient,
    initialWorkspaceId: opts?.workspaceId,
    generateId: opts?.generateId,
  });
  const fsService = new FilesystemService({
    workspaceVolume,
    toolResultsSource: new MemoryVolume(),
    skillsSource: new MemoryVolume(),
  });
  await fsService.init();
  return { fsService, workspaceVolume, workspaceClient };
};

const makeBash = (
  fsService: FilesystemService,
  workspaceVolume: WorkspaceVolume,
  extra?: Partial<ConstructorParameters<typeof BashService>[0]>
) =>
  new BashService({
    filesystemService: fsService,
    workspaceVolume,
    execToolFn: jest.fn(),
    resolveToolId: (id) => id,
    ...extra,
  });

describe('BashService', () => {
  it('exec runs a script in the unified FS, cwd is /tmp', async () => {
    const { fsService, workspaceVolume } = await makeFixture();
    const bash = makeBash(fsService, workspaceVolume);
    const result = await bash.exec('pwd');
    expect(result.exit_code).toBe(0);
    expect(result.stdout.trim()).toBe('/tmp');
  });

  it('writes to /workspace persist across exec calls in the same run', async () => {
    const { fsService, workspaceVolume } = await makeFixture();
    const bash = makeBash(fsService, workspaceVolume);
    await bash.exec('echo hi > /workspace/note.txt');
    const result = await bash.exec('cat /workspace/note.txt');
    expect(result.exit_code).toBe(0);
    expect(result.stdout.trim()).toBe('hi');
  });

  it('a write through bash flips workspace dirty (so flush will save)', async () => {
    // bash no longer owns flush — that's `FilesystemService.flush()` /
    // `WorkspaceVolume.flush()`. What we verify here is that writes via bash
    // do reach the dirty-tracked workspace fs.
    const { fsService, workspaceVolume } = await makeFixture();
    const bash = makeBash(fsService, workspaceVolume);
    expect(workspaceVolume.isDirty()).toBe(false);
    await bash.exec('echo data > /workspace/file.txt');
    expect(workspaceVolume.isDirty()).toBe(true);
  });

  it('read-only bash commands do not flip dirty', async () => {
    const { fsService, workspaceVolume } = await makeFixture();
    const bash = makeBash(fsService, workspaceVolume);
    await bash.exec('echo hi');
    expect(workspaceVolume.isDirty()).toBe(false);
  });

  it('truncates large stdout', async () => {
    const { fsService, workspaceVolume } = await makeFixture();
    const bash = makeBash(fsService, workspaceVolume);
    const chars = SAFEGUARD_TOKEN_COUNT * 20;
    const result = await bash.exec(`printf '%${chars}s' '' | tr ' ' x`);
    expect(result.exit_code).toBe(0);
    expect(result.truncated).toBe(true);
  });

  it('returns exit_code 124 on wall-clock timeout', async () => {
    const { fsService, workspaceVolume } = await makeFixture();
    const execToolFn = jest.fn(
      () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 500))
    );
    const bash = makeBash(fsService, workspaceVolume, { timeoutMs: 50, execToolFn });
    const result = await bash.exec('exec_tool slow.tool');
    expect(result.exit_code).toBe(124);
    expect(result.stderr).toMatch(/timeout/i);
  });

  it('exec_tool inside the script invokes the supplied callback', async () => {
    const { fsService, workspaceVolume } = await makeFixture();
    const execToolFn = jest.fn().mockResolvedValue({ ok: true });
    const bash = makeBash(fsService, workspaceVolume, { execToolFn });
    const result = await bash.exec('exec_tool platform.foo --args=\'{"a":1}\' | cat');
    expect(result.exit_code).toBe(0);
    expect(execToolFn).toHaveBeenCalledWith('platform.foo', { a: 1 });
    expect(result.stdout).toContain('"ok":true');
  });

  describe('getOrCreateWorkspaceId', () => {
    it('returns the existing id when one is set', async () => {
      const { fsService, workspaceVolume } = await makeFixture({ workspaceId: 'existing' });
      const bash = makeBash(fsService, workspaceVolume);
      expect(bash.getOrCreateWorkspaceId()).toBe('existing');
    });

    it('mints a new UUID when none is provided, and reuses it', async () => {
      const { fsService, workspaceVolume } = await makeFixture();
      const bash = makeBash(fsService, workspaceVolume);
      const first = bash.getOrCreateWorkspaceId();
      expect(first).toMatch(/^[0-9a-f-]{36}$/);
      expect(bash.getOrCreateWorkspaceId()).toBe(first);
    });
  });
});

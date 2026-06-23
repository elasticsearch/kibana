/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IFileSystem } from 'just-bash';
import { InMemoryFs, MountableFs } from 'just-bash';
import type { IFilesystemService } from '@kbn/agent-builder-server/runner';
import type { FileEntryAccessor } from '@kbn/agent-builder-server/runner';
import { CapacityLimitedFs } from './capacity_limited_fs';
import { VolumeBackedReadOnlyFs } from './volume_backed_read_only_fs';
import type { WorkspaceVolume } from './workspace_volume';
import { MOUNT_POINTS } from './mount_points';

export const EPHEMERAL_FS_CAPACITY_BYTES = 20 * 1024 * 1024;

export interface FilesystemServiceDeps {
  workspaceVolume: WorkspaceVolume;
  toolResultsSource: FileEntryAccessor;
  skillsSource: FileEntryAccessor;
}

/**
 * Owns the unified `IFileSystem` exposed to the agent. Always instantiated,
 * regardless of feature flags. Pure composition — every mount is backed by a
 * dedicated volume:
 *  - `/workspace`: `WorkspaceVolume` (writable + ES-persisted)
 *  - `/tool_calls`, `/skills`: `VolumeBackedReadOnlyFs` adapters over the
 *    existing tool-result / skills stores (read-only)
 *  - `/tmp` (and elsewhere): ephemeral base `InMemoryFs`
 */
export class FilesystemService implements IFilesystemService {
  private readonly deps: FilesystemServiceDeps;
  private fs?: MountableFs;
  private initialised = false;

  constructor(deps: FilesystemServiceDeps) {
    this.deps = deps;
  }

  async init(): Promise<void> {
    if (this.initialised) return;

    const baseRaw = new InMemoryFs();
    await baseRaw.mkdir('/tmp', { recursive: true });
    // Cap ephemeral writes (/tmp, /home/user, anything not under a mount)
    const base = new CapacityLimitedFs(baseRaw, EPHEMERAL_FS_CAPACITY_BYTES);

    await this.deps.workspaceVolume.load();

    const toolCallsFs = new VolumeBackedReadOnlyFs(this.deps.toolResultsSource);
    const skillsFs = new VolumeBackedReadOnlyFs(this.deps.skillsSource);

    this.fs = new MountableFs({
      base,
      mounts: [
        {
          mountPoint: MOUNT_POINTS.workspace,
          filesystem: this.deps.workspaceVolume.getFilesystem(),
        },
        { mountPoint: MOUNT_POINTS.toolCalls, filesystem: toolCallsFs },
        { mountPoint: MOUNT_POINTS.skills, filesystem: skillsFs },
      ],
    });

    this.initialised = true;
  }

  getFilesystem(): IFileSystem {
    if (!this.fs) {
      throw new Error('FilesystemService not initialised; call init() first');
    }
    return this.fs;
  }

  /**
   * Persist mutable filesystem state for this round. Today that's just the
   * workspace volume → ES; no-op when nothing changed.
   */
  async flush(): Promise<void> {
    await this.deps.workspaceVolume.flush();
  }
}

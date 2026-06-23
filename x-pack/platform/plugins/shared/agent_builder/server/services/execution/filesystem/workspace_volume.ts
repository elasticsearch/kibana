/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { IFileSystem } from 'just-bash';
import { InMemoryFs } from 'just-bash';
import type { IWorkspaceClient, WorkspaceFile } from '../../workspaces';
import { CapacityLimitedFs } from './capacity_limited_fs';
import { DirtyTrackingFs } from './dirty_tracking_fs';
import { MOUNT_POINTS } from './mount_points';

const WORKSPACE_PREFIX = MOUNT_POINTS.workspace;

/** Hard cap on total bytes the agent can store in `/workspace`. */
export const DEFAULT_WORKSPACE_CAPACITY_BYTES = 25 * 1024 * 1024; // 25 MiB

export interface WorkspaceVolumeDeps {
  workspaceClient: IWorkspaceClient;
  /** Existing workspace id from the conversation, if any. */
  initialWorkspaceId?: string;
  /** Maximum total bytes the workspace may hold. Defaults to 25 MiB. */
  capacityBytes?: number;
  /** Test-only override for the UUID generator. */
  generateId?: () => string;
}

/**
 * Owns the agent's writable workspace mount: the in-memory `IFileSystem` plus
 * the ES persistence concerns (load on init, snapshot + save on flush).
 *
 * Concretely encapsulates everything that's special about `/workspace`
 * compared to the other (read-only, in-memory-only) volumes mounted by
 * `FilesystemService`.
 */
export class WorkspaceVolume {
  private readonly deps: WorkspaceVolumeDeps;
  /** Raw underlying fs. Internal `load()` and `snapshot()` use this directly,
   * bypassing the capacity check + dirty tracking — loading persisted state
   * shouldn't count as user-driven changes, and reads should never trip the cap. */
  private readonly fs: InMemoryFs;
  /** Dirty-tracking wrapper. Inspected by `flush()` to skip redundant ES writes
   * when nothing changed this round. */
  private readonly dirtyTrackingFs: DirtyTrackingFs;
  /** Capacity-enforced view exposed via `getFilesystem()` and mounted by
   * `FilesystemService`. Writes from the agent flow capacity-check → underlying
   * fs → dirty flag. */
  private readonly exposedFs: IFileSystem;
  private workspaceId?: string;
  private loaded = false;

  constructor(deps: WorkspaceVolumeDeps) {
    this.deps = deps;
    this.fs = new InMemoryFs();
    // Stack: writes go capacity-check first → if it passes, hit the dirty
    // tracker (which calls the inner fs and flips dirty on success). Failed
    // capacity checks short-circuit before dirty is touched.
    this.dirtyTrackingFs = new DirtyTrackingFs(this.fs);
    this.exposedFs = new CapacityLimitedFs(
      this.dirtyTrackingFs,
      deps.capacityBytes ?? DEFAULT_WORKSPACE_CAPACITY_BYTES
    );
    this.workspaceId = deps.initialWorkspaceId;
  }

  /**
   * Eager-load the persisted workspace from ES (if any) into the in-memory FS.
   * Idempotent — subsequent calls are no-ops.
   */
  async load(): Promise<void> {
    if (this.loaded) return;
    if (!this.workspaceId) {
      this.loaded = true;
      return;
    }
    // Mark loaded only after the read + hydration succeed.
    const doc = await this.deps.workspaceClient.load(this.workspaceId);
    if (doc) {
      for (const [absolutePath, file] of Object.entries(doc.files)) {
        // Document keys carry the `/workspace` prefix; we're mounted at /workspace,
        // so strip it before writing in.
        const relativePath = absolutePath.startsWith(`${WORKSPACE_PREFIX}/`)
          ? absolutePath.slice(WORKSPACE_PREFIX.length)
          : absolutePath;
        const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/')) || '/';
        if (dirPath !== '/') {
          await this.fs.mkdir(dirPath, { recursive: true });
        }
        const buf = Buffer.from(file.content, 'base64');
        await this.fs.writeFile(
          relativePath,
          new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
        );
        // Restore persisted metadata
        await this.fs.chmod(relativePath, file.mode);
        const mtime = new Date(file.mtime);
        await this.fs.utimes(relativePath, mtime, mtime);
      }
    }
    this.loaded = true;
  }

  /**
   * The capacity-enforced, dirty-tracked in-memory FS, suitable for mounting
   * under `MountableFs`. Writes that would push the workspace past its byte
   * cap throw `ENOSPC`; successful mutations flip the internal dirty bit.
   */
  getFilesystem(): IFileSystem {
    return this.exposedFs;
  }

  /** Has the workspace been modified since the last `flush()` (or construction)? */
  isDirty(): boolean {
    return this.dirtyTrackingFs.isDirty();
  }

  /**
   * Returns the existing workspace id if any, otherwise mints a new UUID and
   * remembers it. Subsequent calls return the same id.
   */
  getOrCreateWorkspaceId(): string {
    if (this.workspaceId) return this.workspaceId;
    this.workspaceId = (this.deps.generateId ?? uuidv4)();
    return this.workspaceId;
  }

  /** Returns the workspace id if one has been minted or provided, else undefined. */
  getWorkspaceId(): string | undefined {
    return this.workspaceId;
  }

  /**
   * Persist the current state of the workspace to ES. No-ops when:
   *  - no `workspace_id` has been minted (bash was never used), OR
   *  - nothing has changed since the last flush (`isDirty() === false`), OR
   *  - the workspace is empty and the document doesn't exist yet (no need
   *    to create an empty doc).
   * Resets the dirty bit on success so the next round starts fresh.
   */
  async flush(): Promise<void> {
    if (!this.workspaceId) return;
    if (!this.isDirty()) return;
    const files = await this.snapshot();
    if (Object.keys(files).length === 0) {
      const existing = await this.deps.workspaceClient.load(this.workspaceId);
      if (!existing) {
        this.dirtyTrackingFs.resetDirty();
        return;
      }
    }
    await this.deps.workspaceClient.save(this.workspaceId, files);
    this.dirtyTrackingFs.resetDirty();
  }

  /**
   * Walk the in-memory FS and produce the serialized file map. Exposed for
   * tests; production code should call `flush()`.
   */
  async snapshot(): Promise<Record<string, WorkspaceFile>> {
    const result: Record<string, WorkspaceFile> = {};
    const fs = this.fs;

    const walk = async (dir: string): Promise<void> => {
      let entries: Array<{ name: string; isFile: boolean; isDirectory: boolean }>;
      try {
        entries = await fs.readdirWithFileTypes!(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        if (entry.isDirectory) {
          await walk(fullPath);
        } else if (entry.isFile) {
          const bytes = await fs.readFileBuffer(fullPath);
          const stat = await fs.stat(fullPath);
          result[`${WORKSPACE_PREFIX}${fullPath}`] = {
            content: Buffer.from(bytes).toString('base64'),
            mode: stat.mode,
            mtime: stat.mtime.toISOString(),
          };
        }
      }
    };
    await walk('/');
    return result;
  }
}

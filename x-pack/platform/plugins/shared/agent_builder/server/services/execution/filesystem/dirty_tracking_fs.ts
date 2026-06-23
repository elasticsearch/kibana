/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IFileSystem } from 'just-bash';
import { PassthroughFs } from './passthrough_fs';

/**
 * Wraps an `IFileSystem`, flipping an internal "dirty" bit whenever a write
 * operation succeeds. Used by `WorkspaceVolume` to skip redundant ES saves
 * when nothing in the workspace changed during a round.
 *
 * The dirty bit is flipped AFTER the underlying call returns successfully —
 * a write that throws (capacity check, EROFS, etc.) does not flip the bit.
 */
export class DirtyTrackingFs extends PassthroughFs {
  private dirty = false;

  isDirty(): boolean {
    return this.dirty;
  }

  /** Reset the dirty bit. Called by `WorkspaceVolume.flush()` after a save. */
  resetDirty(): void {
    this.dirty = false;
  }

  async writeFile(
    path: string,
    content: string | Uint8Array,
    options?: Parameters<IFileSystem['writeFile']>[2]
  ): Promise<void> {
    await super.writeFile(path, content, options);
    this.dirty = true;
  }
  async appendFile(
    path: string,
    content: string | Uint8Array,
    options?: Parameters<IFileSystem['appendFile']>[2]
  ): Promise<void> {
    await super.appendFile(path, content, options);
    this.dirty = true;
  }
  async cp(src: string, dest: string, options?: Parameters<IFileSystem['cp']>[2]): Promise<void> {
    await super.cp(src, dest, options);
    this.dirty = true;
  }
  async mv(src: string, dest: string): Promise<void> {
    await super.mv(src, dest);
    this.dirty = true;
  }
  async rm(path: string, options?: Parameters<IFileSystem['rm']>[1]): Promise<void> {
    await super.rm(path, options);
    this.dirty = true;
  }
  async mkdir(path: string, options?: Parameters<IFileSystem['mkdir']>[1]): Promise<void> {
    await super.mkdir(path, options);
    // Empty directories aren't part of our snapshot, but the agent did mutate
    // state; cheaper to flip dirty than to track which mkdirs are followed
    // by writes.
    this.dirty = true;
  }
  async chmod(path: string, mode: number): Promise<void> {
    await super.chmod(path, mode);
    this.dirty = true;
  }
  async symlink(target: string, linkPath: string): Promise<void> {
    await super.symlink(target, linkPath);
    this.dirty = true;
  }
  async link(existingPath: string, newPath: string): Promise<void> {
    await super.link(existingPath, newPath);
    this.dirty = true;
  }
  async utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    await super.utimes(path, atime, mtime);
    this.dirty = true;
  }
}

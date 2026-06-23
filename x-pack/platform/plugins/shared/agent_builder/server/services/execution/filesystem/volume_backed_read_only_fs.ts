/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ByteString, IFileSystem, FsStat } from 'just-bash';
import { unsafeBytesFromLatin1 } from 'just-bash';
import type { FileEntry, FileEntryAccessor } from '@kbn/agent-builder-server/runner';

interface DirentEntry {
  name: string;
  isFile: boolean;
  isDirectory: boolean;
  isSymbolicLink: boolean;
}

const EROFS = (op: string, path: string) =>
  new Error(`EROFS: read-only file system, ${op} '${path}'`);

const DEFAULT_FILE_MODE = 0o644;
const DEFAULT_DIR_MODE = 0o755;

// The underlying volumes don't track real mtimes; we surface a stable sentinel
// so `stat()`/`lstat()` are deterministic between calls.
const SYNTHETIC_MTIME = new Date(0);

const encoder = new TextEncoder();

const entryToString = (entry: FileEntry): string =>
  entry.content.plain_text ?? JSON.stringify(entry.content.raw, undefined, 2);

const entryBytes = (entry: FileEntry): Uint8Array => encoder.encode(entryToString(entry));

/**
 * Read-only `IFileSystem` adapter over a {@link FileEntryAccessor}.
 *
 * Delegates each read method to the underlying source on every call — no
 * caching or refresh dance. New entries appearing in the source mid-session
 * are visible immediately. All mutating methods throw `EROFS`.
 */
export class VolumeBackedReadOnlyFs implements IFileSystem {
  private readonly source: FileEntryAccessor;

  constructor(source: FileEntryAccessor) {
    this.source = source;
  }

  async readFile(path: string): Promise<string> {
    const entry = await this.source.getEntry(path);
    if (!entry) {
      if (await this.source.entryExists(path)) {
        throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return entryToString(entry);
  }

  async readFileBuffer(path: string): Promise<Uint8Array> {
    const entry = await this.source.getEntry(path);
    if (!entry) {
      if (await this.source.entryExists(path)) {
        throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    }
    return entryBytes(entry);
  }

  async readFileBytes(path: string): Promise<ByteString> {
    const buf = await this.readFileBuffer(path);
    let s = '';
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return unsafeBytesFromLatin1(s);
  }

  async readdir(path: string): Promise<string[]> {
    const entries = await this.readdirWithFileTypes(path);
    return entries.map((e) => e.name);
  }

  async readdirWithFileTypes(path: string): Promise<DirentEntry[]> {
    if (!(await this.source.entryExists(path))) {
      throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    }
    const fsEntries = await this.source.listEntries(path);
    const prefix = path === '/' ? '/' : `${path}/`;
    return fsEntries.map((e) => {
      const name = e.path.startsWith(prefix) ? e.path.slice(prefix.length) : e.path;
      return {
        name,
        isFile: e.type === 'file',
        isDirectory: e.type === 'dir',
        isSymbolicLink: false,
      };
    });
  }

  async exists(path: string): Promise<boolean> {
    return this.source.entryExists(path);
  }

  async stat(path: string): Promise<FsStat> {
    return this.statInternal(path, 'stat');
  }

  async lstat(path: string): Promise<FsStat> {
    return this.statInternal(path, 'lstat');
  }

  private async statInternal(path: string, op: 'stat' | 'lstat'): Promise<FsStat> {
    const fileEntry = await this.source.getEntry(path);
    if (fileEntry) {
      return {
        isFile: true,
        isDirectory: false,
        isSymbolicLink: false,
        mode: DEFAULT_FILE_MODE,
        size: entryBytes(fileEntry).length,
        mtime: SYNTHETIC_MTIME,
      };
    }
    if (await this.source.entryExists(path)) {
      return {
        isFile: false,
        isDirectory: true,
        isSymbolicLink: false,
        mode: DEFAULT_DIR_MODE,
        size: 0,
        mtime: SYNTHETIC_MTIME,
      };
    }
    throw new Error(`ENOENT: no such file or directory, ${op} '${path}'`);
  }

  getAllPaths(): string[] {
    // IFileSystem.getAllPaths is sync; our source is async. just-bash uses
    // this method only for glob expansion — returning [] forces just-bash to
    // walk via readdir as needed.
    return [];
  }

  resolvePath(base: string, path: string): string {
    if (path.startsWith('/')) return path;
    if (!base.endsWith('/')) base += '/';
    return base + path;
  }

  async realpath(path: string): Promise<string> {
    if (!(await this.source.entryExists(path))) {
      throw new Error(`ENOENT: no such file or directory, realpath '${path}'`);
    }
    return path;
  }

  // Mutating methods all throw EROFS.
  async writeFile(path: string, _content?: unknown, _options?: unknown): Promise<void> {
    throw EROFS('writeFile', path);
  }
  async appendFile(path: string, _content?: unknown, _options?: unknown): Promise<void> {
    throw EROFS('appendFile', path);
  }
  async mkdir(path: string, _options?: unknown): Promise<void> {
    throw EROFS('mkdir', path);
  }
  async rm(path: string, _options?: unknown): Promise<void> {
    throw EROFS('rm', path);
  }
  async cp(src: string, _dest?: string, _options?: unknown): Promise<void> {
    throw EROFS('cp', src);
  }
  async mv(src: string, _dest?: string): Promise<void> {
    throw EROFS('mv', src);
  }
  async chmod(path: string, _mode?: number): Promise<void> {
    throw EROFS('chmod', path);
  }
  async symlink(_target: string, linkPath: string): Promise<void> {
    throw EROFS('symlink', linkPath);
  }
  async link(_existingPath: string, newPath: string): Promise<void> {
    throw EROFS('link', newPath);
  }
  async readlink(path: string): Promise<string> {
    throw new Error(`EINVAL: invalid argument, readlink '${path}'`);
  }
  async utimes(path: string, _atime?: Date, _mtime?: Date): Promise<void> {
    throw EROFS('utimes', path);
  }
}

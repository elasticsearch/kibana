/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IFileSystem } from 'just-bash';
import { PassthroughFs } from './passthrough_fs';

const byteLengthOf = (content: string | Uint8Array): number =>
  typeof content === 'string' ? Buffer.byteLength(content, 'utf8') : content.byteLength;

const enospc = (op: string, path: string, limit: number) =>
  new Error(
    `ENOSPC: workspace capacity exceeded — ${op} '${path}' would exceed the ${limit}-byte limit`
  );

/**
 * Caps the total content size of an underlying writable `IFileSystem`. Writes
 * that would push the aggregate above `maxBytes` are rejected with `ENOSPC`.
 * Reads and non-growing operations (rm, mkdir, chmod, ...) pass through
 * unchanged via `PassthroughFs`.
 *
 * The current size is computed by walking the fs on each mutation. That's O(n)
 * per write; acceptable for the workspace's tens-to-hundreds of small files at
 * worst. Revisit (cache + invalidate) if walk cost becomes measurable.
 */
export class CapacityLimitedFs extends PassthroughFs {
  private readonly maxBytes: number;

  constructor(inner: IFileSystem, maxBytes: number) {
    super(inner);
    this.maxBytes = maxBytes;
  }

  async writeFile(
    path: string,
    content: string | Uint8Array,
    options?: Parameters<IFileSystem['writeFile']>[2]
  ): Promise<void> {
    const newBytes = byteLengthOf(content);
    const existingBytes = await this.tryGetFileSize(path);
    const projected = (await this.currentSize()) - existingBytes + newBytes;
    if (projected > this.maxBytes) throw enospc('writeFile', path, this.maxBytes);
    return super.writeFile(path, content, options);
  }

  async appendFile(
    path: string,
    content: string | Uint8Array,
    options?: Parameters<IFileSystem['appendFile']>[2]
  ): Promise<void> {
    const addedBytes = byteLengthOf(content);
    const projected = (await this.currentSize()) + addedBytes;
    if (projected > this.maxBytes) throw enospc('appendFile', path, this.maxBytes);
    return super.appendFile(path, content, options);
  }

  async cp(src: string, dest: string, options?: Parameters<IFileSystem['cp']>[2]): Promise<void> {
    const srcBytes = await this.subtreeSize(src);
    const existingDestBytes = await this.subtreeSize(dest);
    const projected = (await this.currentSize()) - existingDestBytes + srcBytes;
    if (projected > this.maxBytes) throw enospc('cp', dest, this.maxBytes);
    return super.cp(src, dest, options);
  }

  // mv is net-neutral in size (bytes move from src to dest); inherited
  // passthrough is correct. rm and mkdir don't grow content; same.

  // ---- size helpers ----

  /** Total bytes used by all files in the fs. Directories don't count. */
  private async currentSize(): Promise<number> {
    return this.subtreeSize('/');
  }

  /** Recursively sums file sizes under `path`. Returns 0 if `path` doesn't exist. */
  private async subtreeSize(path: string): Promise<number> {
    if (!(await this.inner.exists(path))) return 0;
    try {
      const stat = await this.inner.stat(path);
      if (stat.isFile) return stat.size;
    } catch {
      return 0;
    }
    let total = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await this.inner.readdirWithFileTypes!(dir);
      for (const entry of entries) {
        const child = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;
        if (entry.isFile) {
          const s = await this.inner.stat(child);
          total += s.size;
        } else if (entry.isDirectory) {
          await walk(child);
        }
      }
    };
    await walk(path);
    return total;
  }

  private async tryGetFileSize(path: string): Promise<number> {
    if (!(await this.inner.exists(path))) return 0;
    try {
      const stat = await this.inner.stat(path);
      return stat.isFile ? stat.size : 0;
    } catch {
      return 0;
    }
  }
}

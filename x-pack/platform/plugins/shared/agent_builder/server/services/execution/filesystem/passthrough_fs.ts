/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ByteString, IFileSystem, FsStat } from 'just-bash';

/**
 * Base class for `IFileSystem` decorators: every method delegates straight to
 * the inner fs. Subclasses override only the methods they instrument and
 * inherit the rest unchanged.
 */
export class PassthroughFs implements IFileSystem {
  protected readonly inner: IFileSystem;

  constructor(inner: IFileSystem) {
    this.inner = inner;
  }

  // ---- reads ----

  async readFile(path: string, options?: Parameters<IFileSystem['readFile']>[1]): Promise<string> {
    return this.inner.readFile(path, options);
  }
  async readFileBuffer(path: string): Promise<Uint8Array> {
    return this.inner.readFileBuffer(path);
  }
  async readFileBytes(path: string): Promise<ByteString> {
    return this.inner.readFileBytes!(path);
  }
  async exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }
  async stat(path: string): Promise<FsStat> {
    return this.inner.stat(path);
  }
  async lstat(path: string): Promise<FsStat> {
    return this.inner.lstat(path);
  }
  async readdir(path: string): Promise<string[]> {
    return this.inner.readdir(path);
  }
  async readdirWithFileTypes(
    path: string
  ): Promise<
    Array<{ name: string; isFile: boolean; isDirectory: boolean; isSymbolicLink: boolean }>
  > {
    return this.inner.readdirWithFileTypes!(path);
  }
  getAllPaths(): string[] {
    return this.inner.getAllPaths();
  }
  resolvePath(base: string, path: string): string {
    return this.inner.resolvePath(base, path);
  }
  async realpath(path: string): Promise<string> {
    return this.inner.realpath(path);
  }
  async readlink(path: string): Promise<string> {
    return this.inner.readlink(path);
  }

  // ---- mutations ----

  async writeFile(
    path: string,
    content: string | Uint8Array,
    options?: Parameters<IFileSystem['writeFile']>[2]
  ): Promise<void> {
    return this.inner.writeFile(path, content, options);
  }
  async appendFile(
    path: string,
    content: string | Uint8Array,
    options?: Parameters<IFileSystem['appendFile']>[2]
  ): Promise<void> {
    return this.inner.appendFile(path, content, options);
  }
  async cp(src: string, dest: string, options?: Parameters<IFileSystem['cp']>[2]): Promise<void> {
    return this.inner.cp(src, dest, options);
  }
  async mv(src: string, dest: string): Promise<void> {
    return this.inner.mv(src, dest);
  }
  async rm(path: string, options?: Parameters<IFileSystem['rm']>[1]): Promise<void> {
    return this.inner.rm(path, options);
  }
  async mkdir(path: string, options?: Parameters<IFileSystem['mkdir']>[1]): Promise<void> {
    return this.inner.mkdir(path, options);
  }
  async chmod(path: string, mode: number): Promise<void> {
    return this.inner.chmod(path, mode);
  }
  async symlink(target: string, linkPath: string): Promise<void> {
    return this.inner.symlink(target, linkPath);
  }
  async link(existingPath: string, newPath: string): Promise<void> {
    return this.inner.link(existingPath, newPath);
  }
  async utimes(path: string, atime: Date, mtime: Date): Promise<void> {
    return this.inner.utimes(path, atime, mtime);
  }
}

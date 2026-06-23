/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FileEntry, FsEntry, DirEntry } from '@kbn/agent-builder-server/runner/filestore';
import { normalizePath, getPathSegments } from './path_utils';

/**
 * Internal node structure for the directory tree.
 */
interface DirNode {
  /** Child directories by name */
  children: Map<string, DirNode>;
  /** Files directly in this directory by filename */
  files: Map<string, FileEntry>;
}

/**
 * In-memory index of `FileEntry` records.
 */
export class MemoryVolume {
  /** Map of normalized path to FileEntry for O(1) file lookup */
  private readonly fileIndex: Map<string, FileEntry> = new Map();
  /** Root of the directory tree */
  private readonly root: DirNode = this.createDirNode();

  /**
   * Add a file entry to this volume.
   * The entry's path will be normalized.
   */
  add(entry: FileEntry): void {
    const normalizedPath = normalizePath(entry.path);
    const normalizedEntry: FileEntry = { ...entry, path: normalizedPath };

    // Remove existing entry at this path if any
    if (this.fileIndex.has(normalizedPath)) {
      this.removeFromTree(normalizedPath);
    }

    // Add to file index
    this.fileIndex.set(normalizedPath, normalizedEntry);

    // Add to directory tree
    this.addToTree(normalizedEntry);
  }

  /**
   * Remove an entry by path.
   * Returns true if an entry was removed, false if no entry existed at that path.
   */
  remove(path: string): boolean {
    const normalizedPath = normalizePath(path);

    if (!this.fileIndex.has(normalizedPath)) {
      return false;
    }

    this.fileIndex.delete(normalizedPath);
    this.removeFromTree(normalizedPath);
    return true;
  }

  /**
   * Clear all entries from this volume.
   */
  clear(): void {
    this.fileIndex.clear();
    this.root.children.clear();
    this.root.files.clear();
  }

  /**
   * Check if this volume contains a file at the given path.
   * Note: This only checks for files, not implicit directories.
   */
  has(path: string): boolean {
    return this.fileIndex.has(normalizePath(path));
  }

  // ============================================================================
  // Volume interface implementation (async)
  // ============================================================================

  async get(path: string): Promise<FileEntry | undefined> {
    return this.fileIndex.get(normalizePath(path));
  }

  async list(dirPath: string): Promise<FsEntry[]> {
    const normalizedPath = normalizePath(dirPath);
    const node = this.getNode(normalizedPath);

    if (!node) {
      return [];
    }

    const entries: FsEntry[] = [];

    // Add subdirectories
    for (const [childName] of node.children) {
      const childPath = normalizedPath === '/' ? `/${childName}` : `${normalizedPath}/${childName}`;
      entries.push({ path: childPath, type: 'dir' } satisfies DirEntry);
    }

    // Add files
    for (const file of node.files.values()) {
      entries.push(file);
    }

    return entries;
  }

  async getEntry(path: string): Promise<FileEntry | undefined> {
    return this.get(path);
  }
  async listEntries(dirPath: string): Promise<FsEntry[]> {
    return this.list(dirPath);
  }
  async entryExists(path: string): Promise<boolean> {
    return this.exists(path);
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = normalizePath(path);

    // Check if it's a file
    if (this.fileIndex.has(normalizedPath)) {
      return true;
    }

    // Check if it's an implicit directory
    const node = this.getNode(normalizedPath);
    return node !== undefined;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private createDirNode(): DirNode {
    return {
      children: new Map(),
      files: new Map(),
    };
  }

  /**
   * Add a file entry to the directory tree.
   * Creates intermediate directories as needed.
   */
  private addToTree(entry: FileEntry): void {
    const segments = getPathSegments(entry.path);
    const fileName = segments.pop()!;

    // Navigate/create to parent directory
    let node = this.root;
    for (const segment of segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = this.createDirNode();
        node.children.set(segment, child);
      }
      node = child;
    }

    // Add file to the directory
    node.files.set(fileName, entry);
  }

  /**
   * Remove a file from the directory tree.
   * Cleans up empty intermediate directories.
   */
  private removeFromTree(path: string): void {
    const segments = getPathSegments(path);
    const fileName = segments.pop()!;

    // Navigate to parent directory
    const nodeStack: Array<{ node: DirNode; segment: string }> = [];
    let node = this.root;

    for (const segment of segments) {
      const child = node.children.get(segment);
      if (!child) {
        return; // Path doesn't exist in tree
      }
      nodeStack.push({ node, segment });
      node = child;
    }

    // Remove the file
    node.files.delete(fileName);

    // Clean up empty directories (walk back up the tree)
    while (nodeStack.length > 0) {
      const { node: parent, segment } = nodeStack.pop()!;
      const child = parent.children.get(segment)!;

      if (child.files.size === 0 && child.children.size === 0) {
        parent.children.delete(segment);
      } else {
        // Stop cleanup if directory is not empty
        break;
      }
    }
  }

  /**
   * Get the DirNode at the given path, or undefined if it doesn't exist.
   */
  private getNode(path: string): DirNode | undefined {
    const segments = getPathSegments(path);

    let node = this.root;
    for (const segment of segments) {
      const child = node.children.get(segment);
      if (!child) {
        return undefined;
      }
      node = child;
    }

    return node;
  }
}

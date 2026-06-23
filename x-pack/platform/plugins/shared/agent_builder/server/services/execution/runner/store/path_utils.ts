/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Normalizes a path by:
 * - Ensuring it starts with /
 * - Removing trailing slashes (except for root)
 * - Collapsing multiple slashes
 * - Resolving . and .. segments
 */
export function normalizePath(path: string): string {
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Split into segments, filtering empty ones (handles multiple slashes)
  const segments = path.split('/').filter((s) => s !== '');

  // Resolve . and ..
  const resolved: string[] = [];
  for (const segment of segments) {
    if (segment === '.') {
      continue;
    }
    if (segment === '..') {
      resolved.pop();
    } else {
      resolved.push(segment);
    }
  }

  // Rebuild path
  const normalized = '/' + resolved.join('/');
  return normalized;
}

/**
 * Returns the directory portion of a path.
 * e.g., dirname('/a/b/c.txt') => '/a/b'
 */
export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash <= 0) {
    return '/';
  }

  return normalized.substring(0, lastSlash);
}

/**
 * Returns the filename portion of a path (last segment).
 * e.g., basename('/a/b/c.txt') => 'c.txt'
 */
export function basename(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');

  return normalized.substring(lastSlash + 1);
}

/**
 * Joins path segments together and normalizes the result.
 * e.g., join('/a', 'b', 'c.txt') => '/a/b/c.txt'
 */
export function joinPath(...parts: string[]): string {
  const joined = parts.join('/');
  return normalizePath(joined);
}

/**
 * Splits a path into its segments (excluding empty strings).
 * e.g., getPathSegments('/a/b/c') => ['a', 'b', 'c']
 */
export function getPathSegments(path: string): string[] {
  const normalized = normalizePath(path);
  return normalized.split('/').filter((s) => s !== '');
}

/**
 * Checks if a path is the root path.
 */
export function isRootPath(path: string): boolean {
  return normalizePath(path) === '/';
}

/**
 * Gets all ancestor directory paths for a given path.
 * e.g., getAncestorPaths('/a/b/c/file.txt') => ['/', '/a', '/a/b', '/a/b/c']
 */
export function getAncestorPaths(path: string): string[] {
  const segments = getPathSegments(path);
  const ancestors: string[] = ['/'];

  let current = '';
  // Don't include the last segment (the file/dir itself)
  for (let i = 0; i < segments.length - 1; i++) {
    current += '/' + segments[i];
    ancestors.push(current);
  }

  return ancestors;
}

/**
 * Gets the parent path of a given path.
 * Returns '/' for paths directly under root.
 * Returns undefined for the root path itself.
 */
export function getParentPath(path: string): string | undefined {
  const normalized = normalizePath(path);
  if (normalized === '/') {
    return undefined;
  }
  return dirname(normalized);
}

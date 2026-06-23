/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  normalizePath,
  dirname,
  basename,
  joinPath,
  getPathSegments,
  getAncestorPaths,
  getParentPath,
} from './path_utils';

describe('path_utils', () => {
  describe('normalizePath', () => {
    it('ensures path starts with /', () => {
      expect(normalizePath('foo/bar')).toBe('/foo/bar');
    });

    it('removes trailing slashes', () => {
      expect(normalizePath('/foo/bar/')).toBe('/foo/bar');
    });

    it('collapses multiple slashes', () => {
      expect(normalizePath('/foo//bar///baz')).toBe('/foo/bar/baz');
    });

    it('resolves . segments', () => {
      expect(normalizePath('/foo/./bar')).toBe('/foo/bar');
    });

    it('resolves .. segments', () => {
      expect(normalizePath('/foo/bar/../baz')).toBe('/foo/baz');
    });

    it('handles root path', () => {
      expect(normalizePath('/')).toBe('/');
    });
  });

  describe('dirname', () => {
    it('returns parent directory', () => {
      expect(dirname('/a/b/c.txt')).toBe('/a/b');
    });

    it('returns root for top-level files', () => {
      expect(dirname('/file.txt')).toBe('/');
    });
  });

  describe('basename', () => {
    it('returns filename', () => {
      expect(basename('/a/b/c.txt')).toBe('c.txt');
    });
  });

  describe('joinPath', () => {
    it('joins and normalizes paths', () => {
      expect(joinPath('/a', 'b', 'c.txt')).toBe('/a/b/c.txt');
    });
  });

  describe('getPathSegments', () => {
    it('splits path into segments', () => {
      expect(getPathSegments('/a/b/c')).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for root', () => {
      expect(getPathSegments('/')).toEqual([]);
    });
  });

  describe('getAncestorPaths', () => {
    it('returns all ancestor paths', () => {
      expect(getAncestorPaths('/a/b/c/file.txt')).toEqual(['/', '/a', '/a/b', '/a/b/c']);
    });
  });

  describe('getParentPath', () => {
    it('returns parent path', () => {
      expect(getParentPath('/a/b/c')).toBe('/a/b');
    });

    it('returns undefined for root', () => {
      expect(getParentPath('/')).toBeUndefined();
    });
  });
});

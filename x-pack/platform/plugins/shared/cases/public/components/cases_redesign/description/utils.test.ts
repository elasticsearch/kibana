/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EditableMarkdownRefObject } from '../../markdown_editor';
import { getDescriptionPreview, getDraftDescription, isCommentRef } from './utils';

describe('utils', () => {
  describe('getDescriptionPreview', () => {
    it('returns empty string for empty input', () => {
      expect(getDescriptionPreview('')).toBe('');
    });

    it('strips heading markers', () => {
      expect(getDescriptionPreview('## Heading text')).toBe('Heading text');
    });

    it('strips bold and italic markers', () => {
      expect(getDescriptionPreview('**bold** and *italic*')).toBe('bold and italic');
    });

    it('strips image markdown', () => {
      expect(getDescriptionPreview('text ![alt](https://img.png) more')).toBe('text more');
    });

    it('strips link markdown but keeps link text', () => {
      expect(getDescriptionPreview('see [docs](https://example.com) here')).toBe('see docs here');
    });

    it('strips blockquote markers', () => {
      expect(getDescriptionPreview('> quoted text')).toBe('quoted text');
    });

    it('strips backtick code markers', () => {
      expect(getDescriptionPreview('run `command` now')).toBe('run command now');
    });

    it('normalizes whitespace', () => {
      expect(getDescriptionPreview('line one\n\nline two')).toBe('line one line two');
    });

    it('handles combined markdown formatting', () => {
      const markdown = '## Heading\n**bold** and [link](https://example.com)\n> quote';
      expect(getDescriptionPreview(markdown)).toBe('Heading bold and link quote');
    });
  });

  describe('getDraftDescription', () => {
    afterEach(() => {
      sessionStorage.clear();
    });

    it('returns null when no draft is stored', () => {
      expect(getDraftDescription('app', 'case1', 'comment1')).toBeNull();
    });

    it('returns stored draft value', () => {
      const key = 'cases.app.case1.comment1.markdownEditor';
      sessionStorage.setItem(key, 'draft text');
      expect(getDraftDescription('app', 'case1', 'comment1')).toBe('draft text');
    });
  });

  describe('isCommentRef', () => {
    it('returns false for null', () => {
      expect(isCommentRef(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isCommentRef(undefined)).toBe(false);
    });

    it('returns true when setComment is defined', () => {
      const ref: EditableMarkdownRefObject = { setComment: jest.fn() };
      expect(isCommentRef(ref)).toBe(true);
    });
  });
});

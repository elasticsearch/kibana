/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Node } from 'unist';
import { parseCommentString } from '../../../../common/utils/markdown_plugins/utils';
import { getMarkdownEditorStorageKey } from '../../markdown_editor/utils';
import type { EditableMarkdownRefObject } from '../../markdown_editor';

const collectTextNodes = (node: Node, parts: string[]): void => {
  if (node.type === 'text' || node.type === 'inlineCode') {
    parts.push((node as Node & { value: string }).value);
    return;
  }

  if ('children' in node) {
    for (const child of (node as Node & { children: Node[] }).children) {
      collectTextNodes(child, parts);
    }
  }
};

export const getDescriptionPreview = (description: string): string => {
  if (!description) {
    return '';
  }

  const tree = parseCommentString(description);
  const parts: string[] = [];
  collectTextNodes(tree as unknown as Node, parts);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};

export const getDraftDescription = (
  applicationId = '',
  caseId: string,
  commentId: string
): string | null => {
  const draftStorageKey = getMarkdownEditorStorageKey({ appId: applicationId, caseId, commentId });

  return sessionStorage.getItem(draftStorageKey);
};

export const isCommentRef = (
  ref: EditableMarkdownRefObject | null | undefined
): ref is EditableMarkdownRefObject => {
  const commentRef = ref as EditableMarkdownRefObject;
  return commentRef?.setComment != null;
};

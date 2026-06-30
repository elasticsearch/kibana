/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { traverse } from './traversal';
import type { Doc, GroupNode } from './types';

/**
 * A pre-pass that mutates `shouldBreak` on `GroupDoc` nodes. For example,
 * forces all ancestor groups of any `breakParent` command to break. This
 * ensures that a `hardline` deep inside a group hierarchy propagates upward
 * correctly.
 */
export const propagateBreaks = (doc: Doc): void => {
  const groupStack: GroupNode[] = [];
  const visited = new WeakSet<GroupNode>();

  traverse(doc, {
    onEnter(node) {
      if (typeof node === 'string' || Array.isArray(node)) return;

      switch (node.type) {
        case 'break-parent': {
          // Mark the nearest ancestor group for wrapping/breaking.
          if (groupStack.length > 0) {
            const parent = groupStack[groupStack.length - 1];

            if (parent) parent.shouldBreak = true;
          }
          break;
        }
        case 'group': {
          groupStack.push(node);
          if (visited.has(node)) return false;
          visited.add(node);
          break;
        }
      }
    },

    onExit(node) {
      if (typeof node === 'string' || Array.isArray(node)) return;

      switch (node.type) {
        case 'group': {
          const grp = groupStack.pop();

          // If this group broke, propagate to its parent.
          if (grp && grp.shouldBreak && groupStack.length > 0) {
            const parent = groupStack[groupStack.length - 1];

            if (parent) parent.shouldBreak = true;
          }
          break;
        }
      }
    },
  });
};

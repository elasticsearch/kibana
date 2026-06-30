/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Doc } from './types';

/** Sentinel used to mark the position where onExit should fire. */
class ExitMarker {
  constructor(public readonly node: Doc) {}
}

export interface TraverseOpts {
  /** Called when entering a node. Return `false` to skip its children. */
  onEnter?(doc: Doc): false | void;
  /** Called when leaving a node. */
  onExit?(doc: Doc): void;
}

/**
 * Generic depth-first traversal of a print tree. Uses an explicit stack
 * (no recursion) traversal.
 */
export const traverse = (doc: Doc, callbacks: TraverseOpts): void => {
  const hasExit = typeof callbacks.onExit === 'function';
  const stack: Array<Doc | ExitMarker> = [doc];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current instanceof ExitMarker) {
      callbacks.onExit?.(current.node);
      continue;
    }

    const result = callbacks.onEnter?.(current);
    if (result === false) continue; // skip children

    if (typeof current === 'string') {
      if (hasExit) callbacks.onExit?.(current);
      continue;
    }

    if (Array.isArray(current)) {
      if (hasExit) {
        stack.push(new ExitMarker(current));
      }
      for (let i = current.length - 1; i >= 0; i--) {
        stack.push(current[i]);
      }
      continue;
    }

    if (hasExit) {
      stack.push(new ExitMarker(current));
    }

    switch (current.type) {
      case 'group':
      case 'indent':
      case 'indent-if-break':
      case 'align':
      case 'label':
      case 'line-suffix':
        if ('contents' in current && current.contents) {
          stack.push(current.contents);
        }
        break;
      case 'fill':
        for (let i = current.parts.length - 1; i >= 0; i--) {
          stack.push(current.parts[i]);
        }
        break;
      case 'if-break':
        if (current.flatContents) stack.push(current.flatContents);
        if (current.breakContents) stack.push(current.breakContents);
        break;
    }
  }
};

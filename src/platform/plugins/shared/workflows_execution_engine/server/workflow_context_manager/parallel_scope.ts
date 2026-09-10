/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { StackFrame } from '@kbn/workflows';

/** Identifies parallel branch ancestry, including enclosing loop and retry scopes. */
export const getParallelScopes = (stackFrames: StackFrame[]): string[] => {
  const path: string[] = [];
  const scopes: string[] = [];
  for (const frame of stackFrames) {
    for (const scope of frame.nestedScopes) {
      path.push(JSON.stringify([scope.nodeId, scope.scopeId]));
      if (scope.nodeType === 'enter-parallel') {
        scopes.push(JSON.stringify(path));
      }
    }
  }
  return scopes;
};

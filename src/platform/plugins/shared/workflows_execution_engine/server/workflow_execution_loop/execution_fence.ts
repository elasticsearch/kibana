/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { StackFrame } from '@kbn/workflows';

interface ExecutionFence {
  active: boolean;
  stackFrames?: () => StackFrame[];
  parent?: ExecutionFence;
}

interface ExecutionWriteLifetime {
  run<T>(callback: () => T): T;
  close(): void;
}

const executionFence = new AsyncLocalStorage<ExecutionFence>();

/** Rejects mutations from node invocations that have already returned or been cancelled. */
export const canWriteExecution = (): boolean => {
  let fence = executionFence.getStore();
  while (fence) {
    if (!fence.active) return false;
    fence = fence.parent;
  }
  return true;
};

/** Gives each invocation a revocable write lifetime, including detached asynchronous work. */
export const createExecutionFence = (stackFrames?: () => StackFrame[]): ExecutionWriteLifetime => {
  const fence: ExecutionFence = { active: true, parent: executionFence.getStore(), stackFrames };
  return {
    run: <T>(callback: () => T): T => executionFence.run(fence, callback),
    close: (): void => {
      fence.active = false;
    },
  };
};

/** Allows engine-owned teardown to record cancellation after revoking node writes. */
export const outsideExecutionFence = <T>(callback: () => T): T => executionFence.exit(callback);

export const getExecutionStackFrames = (): StackFrame[] | undefined =>
  executionFence.getStore()?.stackFrames?.();

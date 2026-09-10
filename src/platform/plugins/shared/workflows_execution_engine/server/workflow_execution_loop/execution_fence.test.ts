/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { canWriteExecution, createExecutionFence, outsideExecutionFence } from './execution_fence';

describe('execution write lifetime', () => {
  it('rejects detached work after the invocation returns', async () => {
    const fence = createExecutionFence();
    let complete: () => void = () => {};
    const deferred = new Promise<void>((resolve) => {
      complete = resolve;
    });
    const lateWrite = fence.run(async () => {
      expect(canWriteExecution()).toBe(true);
      await deferred;
      return canWriteExecution();
    });
    fence.close();
    complete();
    expect(await lateWrite).toBe(false);
    expect(canWriteExecution()).toBe(true);
  });

  it('revokes every descendant while preserving engine-owned cancellation writes', async () => {
    const parent = createExecutionFence();
    await parent.run(async () => {
      const child = createExecutionFence();
      parent.close();
      expect(child.run(canWriteExecution)).toBe(false);
      expect(outsideExecutionFence(canWriteExecution)).toBe(true);
      expect(child.run(canWriteExecution)).toBe(false);
    });
  });
});

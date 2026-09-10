/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EngineExecutionError } from './engine_execution_error';

/** Stops admission and revokes every active invocation when execution integrity is lost. */
export class ExecutionFailure {
  private readonly controller = new AbortController();
  private failure?: EngineExecutionError;
  private readonly cleanupStarted = new Set<string>();

  public beginCleanup(stepExecutionId: string): boolean {
    if (this.cleanupStarted.has(stepExecutionId)) return false;
    this.cleanupStarted.add(stepExecutionId);
    return true;
  }

  public get signal(): AbortSignal {
    return this.controller.signal;
  }

  public get error(): EngineExecutionError | undefined {
    return this.failure;
  }

  public fail(message: string, cause?: Error): EngineExecutionError {
    if (!this.failure) {
      this.failure =
        cause instanceof EngineExecutionError ? cause : new EngineExecutionError(message, cause);
      this.controller.abort(this.failure);
    }
    return this.failure;
  }

  public stopForTermination(): void {
    this.controller.abort(new Error('Workflow termination requested'));
  }

  public throwIfFailed(): void {
    if (this.failure) throw this.failure;
  }
}

/** Waits for cancelled work without admitting replacements for an operation that is still active. */
export const awaitCancellation = async (
  operation: Promise<void>,
  graceMs: number,
  failure: ExecutionFailure
): Promise<void> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation.then(
        () => undefined,
        () => undefined
      ),
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          failure.fail(`Cancelled operation did not settle within ${graceMs}ms`);
          resolve();
        }, graceMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

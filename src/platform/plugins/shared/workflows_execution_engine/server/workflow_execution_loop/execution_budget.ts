/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

interface QueuedExecution {
  signal: AbortSignal;
  admit: () => void;
  abort: () => void;
}

/** Bounds active operations across every parallel scope in one workflow execution. */
export class ExecutionBudget {
  private active = 0;
  private readonly queue: QueuedExecution[] = [];

  constructor(private readonly limit: number) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('Execution limit must be positive');
  }

  public acquire(signal: AbortSignal): Promise<() => void> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
      const entry: QueuedExecution = {
        signal,
        admit: () => {
          signal.removeEventListener('abort', entry.abort);
          this.active++;
          let released = false;
          resolve(() => {
            if (released) return;
            released = true;
            this.active--;
            this.drain();
          });
        },
        abort: () => {
          const index = this.queue.indexOf(entry);
          if (index !== -1) this.queue.splice(index, 1);
          reject(signal.reason);
        },
      };
      signal.addEventListener('abort', entry.abort, { once: true });
      this.queue.push(entry);
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.limit && this.queue.length > 0) {
      const entry = this.queue.shift();
      if (entry && !entry.signal.aborted) entry.admit();
    }
  }
}

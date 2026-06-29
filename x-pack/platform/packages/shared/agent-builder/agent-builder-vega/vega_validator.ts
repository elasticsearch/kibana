/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Worker } from 'node:worker_threads';
import type { Logger } from '@kbn/logging';

export interface VegaValidationResult {
  /** Set when Vega rejected the spec (a compile or render error). */
  error?: string;
  /** Non-fatal warnings emitted while compiling/running the spec. */
  warnings: string[];
}

interface WorkerResponse {
  id: number;
  ok: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Native ESM worker; see `vega_validator_worker.mjs` for why it must be a `.mjs`
 * loaded as a worker rather than required directly. `require.resolve` yields a
 * path that is correct in both dev (source) and the built distributable.
 */
const WORKER_PATH = require.resolve('./vega_validator_worker.mjs');
const VALIDATION_TIMEOUT_MS = 10_000;
/** Cap rows sent to the worker so validation stays cheap and IPC payloads small. */
const MAX_VALIDATION_ROWS = 500;

let worker: Worker | undefined;
let nextRequestId = 0;
const pending = new Map<
  number,
  { resolve: (result: VegaValidationResult) => void; timer: NodeJS.Timeout }
>();

const settle = (id: number, result: VegaValidationResult): void => {
  const entry = pending.get(id);
  if (!entry) {
    return;
  }
  clearTimeout(entry.timer);
  pending.delete(id);
  entry.resolve(result);
};

// Infra failures (worker crash/exit) must not block spec generation: fail open
// by resolving every in-flight request as "no error, no warnings".
const failOpenAll = (): void => {
  for (const id of [...pending.keys()]) {
    settle(id, { warnings: [] });
  }
};

const getWorker = (logger: Logger): Worker | undefined => {
  if (worker) {
    return worker;
  }
  try {
    worker = new Worker(WORKER_PATH);
  } catch (error) {
    logger.warn(
      `Could not start Vega validator worker: ${error instanceof Error ? error.message : error}`
    );
    return undefined;
  }
  worker.on('message', (response: WorkerResponse) =>
    settle(response.id, {
      error: response.ok ? undefined : response.error,
      warnings: response.warnings ?? [],
    })
  );
  worker.on('error', (error) => {
    logger.warn(`Vega validator worker error: ${error.message}`);
    worker = undefined;
    failOpenAll();
  });
  worker.on('exit', () => {
    worker = undefined;
    failOpenAll();
  });
  // Don't keep the Kibana process alive on account of the validator worker.
  worker.unref();
  return worker;
};

/**
 * Compile (Vega-Lite → Vega) and run a spec in a worker thread to surface
 * render-time errors and warnings before the spec is stored. Returns `{ error }`
 * when the spec is rejected; otherwise `{ warnings }`. Infra failures or timeouts
 * fail open (resolve with no error) so they never block generation.
 */
export const validateVegaSpec = ({
  spec,
  rows = [],
  logger,
}: {
  spec: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  logger: Logger;
}): Promise<VegaValidationResult> => {
  const activeWorker = getWorker(logger);
  if (!activeWorker) {
    return Promise.resolve({ warnings: [] });
  }

  const id = nextRequestId++;
  return new Promise<VegaValidationResult>((resolve) => {
    const timer = setTimeout(() => {
      logger.warn('Vega validation timed out; skipping');
      settle(id, { warnings: [] });
    }, VALIDATION_TIMEOUT_MS);

    pending.set(id, { resolve, timer });
    activeWorker.postMessage({ id, spec, rows: rows.slice(0, MAX_VALIDATION_ROWS) });
  });
};

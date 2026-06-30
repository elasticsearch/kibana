/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Minimal polling helper for eval `beforeAll` setup steps that need to wait
 * for an external system to reach a target state (e.g. Entity Store V2
 * status=running, an index becoming available).
 *
 * Pulled into the suite rather than depending on FTR's `retry` service — the
 * latter isn't available in the evals fixture graph.
 */
export async function waitForCondition(
  check: () => Promise<boolean>,
  {
    label,
    timeoutMs,
    intervalMs = 2000,
    log,
  }: {
    label: string;
    timeoutMs: number;
    intervalMs?: number;
    log: { warning: (m: string) => void };
  }
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return;
    } catch (err) {
      log.warning(`${label} check threw: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

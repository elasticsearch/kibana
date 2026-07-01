/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ExecutionError } from '@kbn/workflows/server';
import { KibanaApiCallError } from '@kbn/workflows-extensions/server';

export const DEFAULT_MAX_STEP_SIZE = '10mb';

/**
 * Normalizes a thrown step error into an {@link ExecutionError} for persistence.
 *
 * Behaves like {@link ExecutionError.fromError} for everything except {@link KibanaApiCallError},
 * which is enriched so an **uncaught** `callKibanaApi` failure persists a well-formed structured
 * error (`type: 'KibanaApiCallError'`, `details: { status }`) instead of a flat `{ type, message }`.
 *
 * Safety: only the safe scalar `status` is lifted into `details`; the potentially large/sensitive
 * `body` and `headers` are intentionally left off, so they are never written to ES.
 * `KibanaApiCallError` is deliberately a plain `Error` (not an `ExecutionError`) to avoid a class
 * init import cycle through the extensions server barrel — this is where the structured mapping lives.
 */
export function toExecutionError(error: Error): ExecutionError {
  if (error instanceof KibanaApiCallError) {
    return new ExecutionError({
      type: 'KibanaApiCallError',
      message: error.message,
      details: { status: error.status },
    });
  }
  return ExecutionError.fromError(error);
}

const BYTE_UNITS: Array<{ unit: string; size: number }> = [
  { unit: 'GB', size: 1024 * 1024 * 1024 },
  { unit: 'MB', size: 1024 * 1024 },
  { unit: 'KB', size: 1024 },
  { unit: 'B', size: 1 },
];

/**
 * Formats a byte count into a human-readable string (e.g., "15.2 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  for (const { unit, size } of BYTE_UNITS) {
    if (bytes >= size) {
      const value = bytes / size;
      return `${Number.isInteger(value) ? value : value.toFixed(1)} ${unit}`;
    }
  }
  return `${bytes} B`;
}

const BYTE_SIZE_PATTERN = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)$/i;

const UNIT_MULTIPLIERS: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

/**
 * Parses a byte size string (e.g., "10mb", "15MB", "1gb", "500kb") into bytes.
 * Also accepts raw numbers (treated as bytes).
 */
export function parseByteSize(value: string | number): number {
  if (typeof value === 'number') {
    return value;
  }

  const match = value.trim().match(BYTE_SIZE_PATTERN);
  if (!match) {
    throw new Error(
      `Invalid byte size string: "${value}". Expected format: <number><unit> (e.g., "10mb", "1gb", "500kb").`
    );
  }

  const [, numStr, unit] = match;
  const num = parseFloat(numStr);
  const multiplier = UNIT_MULTIPLIERS[unit.toLowerCase()];
  return Math.floor(num * multiplier);
}

/**
 * Safely measures the serialized size of an output value.
 * For Buffer outputs (binary HTTP responses) uses the raw byte length directly,
 * avoiding the ~4x amplification from JSON.stringify({ type: "Buffer", data: [...] }).
 * Returns the byte count on success, or `null` if the value is not serializable
 * to JSON. This covers both the throwing cases (circular references, BigInt)
 * and the silent ones — `JSON.stringify(undefined)` and `JSON.stringify(fn)`
 * return `undefined` rather than throwing, and would otherwise be mis-sized
 * as the 9-byte string "undefined" by `Buffer.byteLength`. A `null` result is
 * a hard signal: the value cannot be persisted to ES, so callers must fail
 * closed (refuse the output / treat as oversized) rather than silently allow
 * it through.
 */
export function safeOutputSize(output: unknown): number | null {
  if (Buffer.isBuffer(output)) {
    return output.byteLength;
  }
  try {
    const json = JSON.stringify(output);
    if (typeof json !== 'string') {
      return null;
    }
    return Buffer.byteLength(json, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Error thrown when a step's response or output exceeds the configured size limit.
 * Used by both Layer 1 (pre-emptive I/O enforcement) and Layer 2 (base class output guard).
 */
export class ResponseSizeLimitError extends ExecutionError {
  constructor(
    limitBytes: number,
    stepName: string,
    options: {
      actualBytes?: number;
      contentLengthBytes?: number;
      estimatedOutputBytes?: number;
    } = {}
  ) {
    const { actualBytes, contentLengthBytes, estimatedOutputBytes } = options;
    const candidates = [actualBytes, estimatedOutputBytes, contentLengthBytes];
    const suggestedLimitBytes = candidates.find(
      (n): n is number => typeof n === 'number' && n > limitBytes
    );
    const actualSizeMessage = actualBytes
      ? `Actual serialized output size was ${formatBytes(actualBytes)}. `
      : '';
    const contentLengthMessage =
      contentLengthBytes !== undefined && contentLengthBytes >= limitBytes
        ? `The response advertised a content length of ${formatBytes(contentLengthBytes)}. `
        : '';
    const estimatedOutputMessage = estimatedOutputBytes
      ? `Estimated step output size is ${formatBytes(estimatedOutputBytes)}. `
      : '';
    const suggestedLimitMessage = suggestedLimitBytes
      ? `Set 'max-step-size' to at least ${formatBytes(
          suggestedLimitBytes
        )}, or reduce the response size.`
      : `Configure 'max-step-size' at the step or workflow level to increase the limit, or reduce the response size (e.g., filter fields, limit results).`;

    super({
      type: 'StepSizeLimitExceeded',
      message: `Step "${stepName}" output exceeded the ${formatBytes(
        limitBytes
      )} size limit. ${actualSizeMessage}${contentLengthMessage}${estimatedOutputMessage}${suggestedLimitMessage}`,
      details: {
        limitBytes,
        ...(actualBytes ? { actualBytes } : {}),
        ...(contentLengthBytes ? { contentLengthBytes } : {}),
        ...(estimatedOutputBytes ? { estimatedOutputBytes } : {}),
        ...(suggestedLimitBytes ? { suggestedLimitBytes } : {}),
      },
    });
  }
}

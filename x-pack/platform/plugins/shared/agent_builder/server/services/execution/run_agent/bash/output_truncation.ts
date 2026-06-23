/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  estimateTokens,
  truncateTokens,
} from '@kbn/agent-builder-genai-utils/tools/utils/token_count';

export const SAFEGUARD_TOKEN_COUNT = 20_000;

export interface TruncatedOutput {
  stdout: string;
  stderr: string;
  truncated: boolean;
}

/**
 * Applies a per-stream token safeguard. Each stream is truncated independently
 * so a huge stderr doesn't eat the stdout budget.
 */
export const truncateBashOutput = (stdout: string, stderr: string): TruncatedOutput => {
  let truncated = false;
  let outOut = stdout;
  let outErr = stderr;
  if (estimateTokens(stdout) > SAFEGUARD_TOKEN_COUNT) {
    outOut = truncateTokens(stdout, SAFEGUARD_TOKEN_COUNT);
    truncated = true;
  }
  if (estimateTokens(stderr) > SAFEGUARD_TOKEN_COUNT) {
    outErr = truncateTokens(stderr, SAFEGUARD_TOKEN_COUNT);
    truncated = true;
  }
  return { stdout: outOut, stderr: outErr, truncated };
};

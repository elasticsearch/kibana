/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface BashExecResult {
  stdout: string;
  stderr: string;
  exit_code: number;
  truncated?: boolean;
}

/**
 * Public contract for the bash runtime.
 */
export interface IBashService {
  exec(command: string): Promise<BashExecResult>;
  getOrCreateWorkspaceId(): string;
  getWorkspaceId(): string | undefined;
}

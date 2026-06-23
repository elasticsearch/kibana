/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Mount points exposed to the agent by `FilesystemService`. These are also the
 * path prefixes the legacy tool_results / skills volumes store entries under,
 * so that paths the agent sees match the paths the volume holds.
 */
export const MOUNT_POINTS = {
  /** Writable, ES-persisted workspace. */
  workspace: '/workspace',
  /** Read-only view of prior tool-call results in the current conversation. */
  toolCalls: '/tool_calls',
  /** Read-only view of skill files. */
  skills: '/skills',
} as const;

export type MountPoint = (typeof MOUNT_POINTS)[keyof typeof MOUNT_POINTS];

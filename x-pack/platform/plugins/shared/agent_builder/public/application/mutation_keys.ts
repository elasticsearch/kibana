/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Mutation keys for react-query
 */
export const mutationKeys = {
  sendMessage: ['sendMessage'] as const,
  resumeRound: ['resumeRound'] as const,
  updateAgentAccessControl: (agentId: string) =>
    ['agentProfiles', agentId, 'accessControl', 'update'] as const,
};

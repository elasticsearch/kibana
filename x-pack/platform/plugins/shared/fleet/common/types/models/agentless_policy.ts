/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';

import type { AgentlessPolicySchema } from './agentless_policy_schema';

/**
 * Response DTO returned by the agentless policies API.
 *
 * Derived from the route schema so the type and the schema can never diverge.
 * See `NewAgentlessPolicy` in `../rest_spec/agentless_policy` for the request contract.
 */
export type AgentlessPolicy = TypeOf<typeof AgentlessPolicySchema>;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Reason codes that explain why an endpoint lookup produced a "not found" result.
 * The consumer (agent / caller) must distinguish these to choose the right
 * follow-up action.
 *
 * - endpoint_not_found: the host name was resolved to zero fleet agents.
 * - index_not_found:  the Elasticsearch index the metadata service queries
 *   does not exist (e.g. data stream was deleted or never provisioned).
 */
export type HostLookupReason = 'endpoint_not_found' | 'index_not_found';

/**
 * Shared return shape for the endpoint-status tool when the host could not be
 * found. All three inline tools (isolate, unisolate, status) use a
 * consistent `found` + `reason` pattern so the AI agent can branch on the
 * cause of a not-found outcome.
 */
export interface EndpointNotFoundResult {
  hostName: string;
  found: false;
  reason: HostLookupReason;
  status: string;
  isolated: false;
  lastSeen: null;
  /** Human-readable explanation for the agent's response text. */
  message: string;
}

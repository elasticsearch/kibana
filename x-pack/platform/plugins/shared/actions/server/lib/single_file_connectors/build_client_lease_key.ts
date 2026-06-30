/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pool key = one shared client instance per (connector instance, client type).
 *
 * - connectorId: execOptions.actionId (two saved connectors must not share a session).
 * - clientTypeId: registry slot ('mcp').
 * - ':shared': one pool entry per connector+type (not per sub-action). Per-user OAuth pool
 *   key isolation via profileUid is the deferred next term.
 */
export function buildClientLeaseKey(connectorId: string, clientTypeId: string): string {
  return `${connectorId}:${clientTypeId}:shared`;
}

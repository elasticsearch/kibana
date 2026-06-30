/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { McpClient } from '@kbn/mcp-client';
import type { ClientTypeSpec } from './client_type_spec';
import { mcpClientType } from './mcp_client_type';

/**
 * Maps each client-type id in the registry to the client instance its `build()`
 * returns. This is the single source of truth for the registry: it drives both
 * the valid `ctx.getClient(id)` ids ({@link ClientTypeId}) and the resolved type
 * (`ctx.getClient('mcp')` → `McpClient`). Extend this when adding a new client
 * type, and `clientTypes` below must provide a matching entry.
 *
 * PoC: actions plugin LeasePool + generateExecutorFunction wire these specs into
 * `ctx.getClient`; handlers no longer call withMcpClient per action.
 */
export interface ClientRegistry {
  mcp: McpClient;
}

/** The set of valid client-type ids, derived from {@link ClientRegistry}. */
export type ClientTypeId = keyof ClientRegistry;

export const clientTypes: Readonly<Record<ClientTypeId, ClientTypeSpec<unknown>>> = {
  mcp: mcpClientType,
};

export type {
  ClientTypeSpec,
  BuildContext,
  ConnectorNetwork,
  CredentialAccessor,
} from './client_type_spec';

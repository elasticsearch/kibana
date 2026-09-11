/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Stack Connectors 2.0 - Minimal TypeScript Specification
 *
 * This is a simplified spec containing only features used by example connectors.
 * For the comprehensive specification, see connector_rfc.ts
 *
 * Key principles:
 * - Single schema (config + secrets together)
 * - Standard auth types
 * - Secrets marked with meta.sensitive
 * - Standard auth schemas (reusable)
 * - Zod for validation and UI derivation
 */

import type { z } from '@kbn/zod/v4';
import type { Logger } from '@kbn/logging';
import type { CustomHostSettings, ProxySettings, SSLSettings } from '@kbn/actions-utils';
import type { LicenseType } from '@kbn/licensing-types';
import type { AxiosHeaderValue, AxiosInstance } from 'axios';
import type { ConnectorSpecEvents } from './connector_spec_events';
import type { ClientRegistry, ClientTypeId } from './lib/clients';

export { UISchemas } from './connector_spec_ui';

// ============================================================================
// INTERNATIONALIZATION
// ============================================================================

export function createI18nKeys(connectorId: string) {
  const base = `xpack.stackConnectors${connectorId}`;
  return {
    metadata: (key: string) => `${base}.metadata.${key}`,
    config: (key: string) => `${base}.config.${key}`,
    secrets: (key: string) => `${base}.secrets.${key}`,
    actions: (actionName: string, key: string) => `${base}.actions.${actionName}.${key}`,
    validation: (key: string) => `${base}.validation.${key}`,
    test: (key: string) => `${base}.test.${key}`,
  };
}

// ============================================================================
// METADATA
// ============================================================================

export interface ConnectorMetadata {
  id: string;
  displayName: string;
  icon?: string;
  description: string;
  /**
   * Documentation URL for this connector type. Set it when the id-based derivation
   * wouldn't resolve to the published page (e.g. a differing slug or a third-party site).
   * Use an empty string when the connector has no dedicated page: it resolves to the
   * connectors index via the doc-links service. When omitted, the URL is derived from
   * the connector id.
   */
  docsUrl?: string;
  minimumLicense: LicenseType;
  isTechnicalPreview?: boolean;
  supportedFeatureIds: Array<
    | 'alerting'
    | 'cases'
    | 'uptime'
    | 'siem'
    | 'generativeAIForSecurity'
    | 'generativeAIForObservability'
    | 'generativeAIForSearchPlayground'
    | 'endpointSecurity'
    | 'workflows'
    | 'agentBuilder'
    | 'contextEngine'
  >;
}

// ============================================================================
// STANDARD AUTH SCHEMAS - PHASE 1
// ============================================================================
// Phase 1 supports only: Header, Basic, Bearer
// OAuth2, SSL/mTLS, AWS SigV4 → Phase 2 (see connector_rfc.ts)

// Auth schemas defined in ./auth_types
// oauth authz code and client credentials with client secret
export interface OAuthGetTokenOpts {
  authType: 'oauth';
  tokenUrl: string;
  scope?: string;
  clientId: string;
  clientSecret: string;
  additionalFields?: Record<string, unknown>;
  tokenEndpointAuthMethod?: 'client_secret_post' | 'client_secret_basic';
  accessTokenPath?: string;
  tokenTypePath?: string;
  tokenType?: string;
}

export interface OAuthClientCredsPrivateKeyJWTGetTokenOpts {
  authType: 'oauth_client_credentials_private_key_jwt';
  tokenUrl: string;
  scope?: string;
  clientId: string;
}

export interface EarsGetTokenOpts {
  authType: 'ears';
  provider: string;
  scope?: string;
}

export type GetTokenOpts =
  | OAuthGetTokenOpts
  | OAuthClientCredsPrivateKeyJWTGetTokenOpts
  | EarsGetTokenOpts;

export interface AuthContext {
  getCustomHostSettings: (url: string) => CustomHostSettings | undefined;
  getToken: (opts: GetTokenOpts) => Promise<string | null>;
  logger: Logger;
  proxySettings?: ProxySettings;
  sslSettings: SSLSettings;
}

export type AuthMode = 'per-user' | 'shared';

export interface AuthTypeDefinition {
  id: string;
  schema: z.ZodObject<Record<string, z.ZodType>>;
  normalizeSchema?: (defaults?: Record<string, unknown>) => z.ZodObject<Record<string, z.ZodType>>;
  authMode?: AuthMode;
}

export interface AuthTypeSpec<T extends Record<string, unknown>> extends AuthTypeDefinition {
  configure: (ctx: AuthContext, axiosInstance: AxiosInstance, secret: T) => Promise<AxiosInstance>;
  getAuthHeaders?(ctx: AuthContext, secret: T): Promise<Record<string, string>>;
  /**
   * Specs using this auth type reach the third party through the Elastic-hosted Relay rather than
   * authenticating the axios client. Defaults to false.
   */
  usesRelayTransport?: boolean;
  /** Kibana manages these credentials: the UI hides the auth type and create/update rejects it, but connectors Kibana already provisioned keep executing. */
  isKibanaManaged?: boolean;
}

export type NormalizedAuthType = AuthTypeSpec<Record<string, unknown>>;

// ============================================================================
// PHASE 2 AUTH TYPES (Not supported yet - see connector_rfc.ts)
// ============================================================================
// - OAuth2 (clientId, clientSecret, token refresh)
// - SSL/mTLS (certificate-based authentication)
// - Custom (connector-specific auth flows)

// ============================================================================
// POLICIES
// ============================================================================

export const RETRY_RATE_LIMIT = [429, 503] as const;
export const RETRY_SERVER_ERRORS = [500, 502, 503, 504] as const;
export const RETRY_GATEWAY_ERRORS = [502, 503, 504] as const;
export const RETRY_TIMEOUT_AND_RATE_LIMIT = [408, 429, 503] as const;

export interface RateLimitPolicy {
  strategy: 'header' | 'status_code' | 'response_body';
  codes?: number[];
  remainingHeader?: string;
  resetHeader?: string;
  bodyPath?: string;
}

export interface PaginationPolicy {
  strategy: 'cursor' | 'offset' | 'link_header' | 'none';
  parameterLocation?: 'query_params' | 'headers' | 'body';
  resultPath?: string;
  cursorParam?: string;
  cursorPath?: string;
  offsetParam?: string;
  limitParam?: string;
  linkHeaderName?: string;
  pageSizeParam?: string;
  defaultPageSize?: number;
}

export interface RetryPolicy {
  retryOnStatusCodes?: number[];
  customRetryCondition?: (error: {
    status?: number;
    message?: string;
    response?: unknown;
  }) => boolean;
  maxRetries?: number;
  backoffStrategy?: 'exponential' | 'linear' | 'fixed';
  initialDelay?: number;
}

export interface ErrorPolicy {
  classifyError?: (error: { status?: number; message?: string }) => 'user' | 'system' | 'unknown';
  userErrorCodes?: number[];
  systemErrorCodes?: number[];
}

export interface StreamingPolicy {
  enabled: boolean;
  mechanism?: 'sse' | 'chunked' | 'websocket';
  parser?: 'ndjson' | 'json' | 'text' | 'custom';
}

export interface ConnectorPolicies {
  rateLimit?: RateLimitPolicy;
  pagination?: PaginationPolicy;
  retry?: RetryPolicy;
  error?: ErrorPolicy;
  streaming?: StreamingPolicy;
}

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * Scope of a connector action's side effects. Advisory signal for the LLM and
 * any orchestration layer — does not enforce access control at runtime.
 *
 * - `read`    The action only reads data; no external state is modified.
 * - `write`   The action creates or appends data but does not overwrite or delete
 *             existing state (e.g. send a message, create a resource).
 * - `destroy` The action may overwrite, update, or delete existing data
 *             (e.g. resolve an issue, delete a resource, patch a record).
 */
export type ActionScope = 'read' | 'write' | 'destroy';

export interface ActionDefinition<TInput = unknown, TOutput = unknown, TError = unknown> {
  isTool?: boolean;
  input: z.ZodSchema<TInput>;
  output?: z.ZodSchema<TOutput>;
  error?: z.ZodSchema<TError>;
  handler: (ctx: ActionContext, input: TInput) => Promise<TOutput>;
  description?: string;
  actionGroup?: string;
  supportsStreaming?: boolean;
  /**
   * HTTP response header that advertises response size for this action.
   * The generated executor reads this header from Axios errors when the Actions
   * response-size limit is exceeded. Defaults to `content-length`.
   */
  responseSizeHeader?: string;
  /** Advisory scope hint for the LLM/orchestration layer. See {@link ActionScope}. */
  scope: ActionScope;
}

/**
 * The slice of the Actions plugin's Relay client that action handlers use. Declared structurally so
 * this package does not depend on x-pack; the concrete `RelayClient` satisfies it by shape.
 */
export interface RelayActionClient {
  trigger(input: {
    tenantKey: string;
    /** Slack conversation id or a connected channel name (`#general`). */
    channel: string;
    message: string;
    threadTs?: string;
  }): Promise<{ ref: string; tenantKey: string; channel: string }>;
  /** One page of the channels this deployment has connected; follow `nextCursor` for the rest. */
  listBindings(
    tenantKey: string,
    options?: { cursor?: string; limit?: number }
  ): Promise<{
    bindings: Array<{
      scope_id?: string;
      display_name?: string;
      visibility?: 'public' | 'private';
    }>;
    nextCursor?: string;
  }>;
}

export interface ActionContext {
  client: AxiosInstance;
  /**
   * Leases a pooled, ready-to-use client by id. The connection is built on the
   * first request for a given connector and reused across calls. Building is an
   * async, side-effecting operation, so this is an explicit call (not a property)
   * and only the client types a handler actually asks for are ever built.
   *
   * Lifetime is governed by the actions plugin's client lease pool, not by the action
   * stack frame. No client types are registered yet, so `ClientTypeId` currently
   * resolves to `never`.
   */
  getClient: <K extends ClientTypeId>(id: K) => Promise<ClientRegistry[K]>;
  config?: Record<string, unknown>;
  connectorUsageCollector?: unknown;
  log: Logger;
  secrets?: Record<string, unknown>;
  /**
   * Reaches the third party through the Elastic-hosted Relay, for specs whose auth type routes that
   * way. Undefined when the auth type does not use Relay transport or the deployment has no Relay
   * configured.
   */
  relay?: RelayActionClient;
}

// ============================================================================
// TRANSFORMATIONS
// ============================================================================

export interface TemplateRendering {
  enabled: boolean;
  format?: 'mustache' | 'handlebars' | 'custom';
  escaping?: 'html' | 'json' | 'markdown' | 'none';
}

export interface Transformations {
  templates?: TemplateRendering;
  serializeRequest?: (data: unknown) => unknown;
  deserializeResponse?: (data: unknown) => unknown;
  interceptors?: {
    request?: (config: unknown) => unknown | Promise<unknown>;
    response?: (response: unknown) => unknown | Promise<unknown>;
  };
}

// ============================================================================
// TESTING
// ============================================================================

export const TEST_CONNECTOR_SUB_ACTION = '_test';

/**
 * Success = return data (use `{}` when there's nothing to report); failure = throw.
 * The `ok?: never` intersection prevents accidentally returning the legacy `{ ok: false }` shape.
 */
export type ConnectorTestHandlerResult = Record<string, unknown> & { ok?: never };

export interface ConnectorTest {
  /**
   * Test-tab handler. Return data (use `{}` when there's nothing to report); throw on failure.
   * A resolved value is treated as success by the executor.
   */
  handler: (ctx: ActionContext) => Promise<ConnectorTestHandlerResult>;
  description?: string;
  /** Must be true for the Test tab to appear and the opted_in_test_handlers suite to run this handler. Events-only specs must keep this false; Test is outbound HTTP. */
  enabled: boolean;
}

// ============================================================================
// MAIN CONNECTOR DEFINITION
// ============================================================================

export interface AuthTypeDef {
  type: string;
  /** When true, renders a "Recommended" badge in the picker to highlight the preferred auth option. */
  isRecommended?: boolean;
  /** When true, excluded from the UI picker but kept in the validation schema for backwards compatibility with existing connectors. */
  isLegacy?: boolean;
  isExperimental?: boolean;
  defaults: Record<string, unknown>;
  overrides?: {
    /** Display name shown in the auth type picker. Defaults to the auth type's built-in label when omitted. */
    label?: string;
    meta?: Record<string, Record<string, unknown>>;
    // can override other Zod fields here in the future if needed
  };
}
export interface ConnectorSpec {
  metadata: ConnectorMetadata;

  auth?: {
    types: Array<string | AuthTypeDef>;
    headers?: Record<string, AxiosHeaderValue>;
  };

  // Single unified schema for all connector fields (config + secrets)
  // Mark sensitive fields with withUIMeta({ sensitive: true })
  schema?: z.ZodObject;

  validateUrls?: {
    fields?: string[];
  };

  policies?: ConnectorPolicies;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- record of actions with different input types (contravariance)
  actions: Record<string, ActionDefinition<any, any, any>>;

  test: ConnectorTest;

  // Optional inbound events (`handleEvents` + definitions).
  // Omit when the connector has no inbound surface. A connector may declare both
  // `actions` and `events`. Only allowlisted specs may set this (see contract tests).
  events?: ConnectorSpecEvents;

  transformations?: Transformations;

  // Optional skill content for Agent Builder. When present, this string is
  // included in the connector's agent attachment representation so the LLM
  // has richer context about how to use the connector's sub-actions.
  skill?: string;
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================

export function requiresCredentials(auth: { method: string }): boolean {
  return auth.method !== 'none' && auth.method !== 'webhook';
}

export function supportsStreaming(connector: ConnectorSpec): boolean {
  return connector.policies?.streaming?.enabled ?? false;
}

export function getActionNames(connector: ConnectorSpec): string[] {
  return Object.keys(connector.actions);
}

export function isToolAction(connector: ConnectorSpec, actionName: string): boolean {
  return connector.actions[actionName]?.isTool ?? false;
}

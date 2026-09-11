/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface RelayInstallRequest {
  kibana_api_key: string;
  kibana_url: string;
  kibana_version: string;
  license_info: string;
  created_by_user_key?: string;
}

export interface RelayInstallResponse {
  authorize_url: string;
  claim_id: string;
}

export type RelayClaimResponse =
  | { status: 'pending' }
  | { status: 'complete'; tenant_key: string | undefined };

export interface RelayCallbackResponse {
  status: number;
}

/**
 * A single entry from the caller-owned bindings inventory
 * (`GET /v1/slack/tenants/:tenantKey/bindings`).
 *
 * The endpoint returns only the calling deployment's own SUB bindings — the
 * "connected channels" for this tenant — so entries carry no ownership status
 * or target ref. Each row includes a persisted display snapshot
 * (`display_name`, `visibility`), so the connected-channel list can be served
 * without any additional Slack call.
 */
export interface RelayBinding {
  /** Binding scope type from the Relay: always `"SUB"` for channel-specific bindings. */
  scope_type?: string;
  /** Channel id — present for `SUB`-scope entries. */
  scope_id?: string;
  /** Persisted display-name snapshot; absent for legacy rows without one. */
  display_name?: string;
  /** Persisted visibility snapshot; absent for legacy rows without one. */
  visibility?: 'public' | 'private';
}

/** Options for fetching a single page of the caller-owned bindings inventory. */
export interface RelayListBindingsOptions {
  /** Opaque cursor from a previous page's `nextCursor`; omit for the first page. */
  cursor?: string;
  /** Max entries to return in this page. Defaults to the Relay's max page size. */
  limit?: number;
}

/** A single page of the caller-owned bindings inventory, plus the cursor to the next page. */
export interface RelayBindingsPage {
  bindings: RelayBinding[];
  /** Present when more pages remain; pass back as `cursor` to fetch the next page. */
  nextCursor?: string;
}

/**
 * The Relay resolves `channel` to a bound Slack conversation. Accepts a conversation id (`C…` /
 * `G…` / `D…`) or a connected channel name (`#general`, `general`).
 */
export interface RelayTriggerInput {
  tenantKey: string;
  channel: string;
  message: string;
  /** Timestamp of the message to reply to, when posting into an existing thread. */
  threadTs?: string;
}

export interface RelayTriggerResponse {
  /** The posted message's Slack `ts`. */
  ref: string;
  tenantKey: string;
  /** Slack conversation id after Relay resolved a name, or the id that was sent. */
  channel: string;
}

export interface RelayClientContract {
  startInstall(body: RelayInstallRequest): Promise<RelayInstallResponse>;
  fetchClaim(claimId: string): Promise<RelayClaimResponse>;
  /** Unbind a single workspace binding identified by its tenant key. */
  unbind(tenantKey: string): Promise<void>;
  /**
   * Fetch a single page of the calling deployment's own SUB (channel-scoped) bindings for a
   * given Slack workspace (tenant) — the "connected channels" inventory. Each entry carries
   * its persisted display snapshot (`display_name`, `visibility`). Follow `nextCursor` to
   * read subsequent pages of the cursor-paginated endpoint.
   */
  listBindings(tenantKey: string, options?: RelayListBindingsOptions): Promise<RelayBindingsPage>;
  /** Claim an unclaimed channel for this deployment (put-if-absent; 409 if already claimed). */
  bind(tenantKey: string, channelId: string): Promise<void>;
  /** Release a channel binding owned by this deployment (404 if none; 403 if owned by another). */
  unbindChannel(tenantKey: string, channelId: string): Promise<void>;
  /** Post a message to a channel bound here (403 if not bound; 409 if the app was uninstalled). */
  trigger(input: RelayTriggerInput): Promise<RelayTriggerResponse>;
  isRelayOrigin(url: string): boolean;
  postCallback(url: string, body: unknown, signal: AbortSignal): Promise<RelayCallbackResponse>;
}

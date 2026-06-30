/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { InboxAction, InboxChannel, ListInboxActionsRequestQuery } from '@kbn/inbox-common';

/**
 * Request-scoped context passed to every provider call. Providers receive the
 * originating `KibanaRequest` so they can call their own plugin's APIs as the
 * current user (via scoped clients) and honor space/auth semantics.
 */
export interface InboxRequestContext {
  request: KibanaRequest;
  spaceId: string;
  /**
   * Surface the response was submitted through. Only populated for the
   * `respond()` path — list/history fan-outs leave this `undefined`. The
   * respond HTTP route reads it from a slug-validated request body field, so
   * providers can treat it as a trusted-shape but client-supplied tag.
   * Defaults to `inbox` if a respond client doesn't explicitly identify
   * itself. Paired with the server-derived `respondedBy` in audit
   * metadata — the latter is what identity decisions key off of.
   */
  channel?: InboxChannel;
}

/**
 * Filters a provider sees when satisfying a list request. These mirror the
 * public `ListInboxActionsRequestQuery` but are pre-validated by the framework
 * and include the bounded provider slice the registry needs before it performs
 * cross-provider merge-sort pagination.
 */
export interface InboxActionProviderListParams {
  status?: ListInboxActionsRequestQuery['status'];
  /**
   * Provider-local page request. The registry currently calls providers with
   * `page: 1` and `perPage: requestedPage * requestedPerPage`, then applies
   * final cross-provider pagination after merge-sorting.
   */
  page?: number;
  perPage?: number;
}

/**
 * History/audit-feed filters surfaced through the
 * `InboxActionProvider.listProcessed` call. Providers honour whichever
 * subset they can answer with native indexes; unknown filters are permitted
 * to no-op (the framework does *not* downgrade or reject the request — it
 * would defeat the purpose of provider-extensibility to invent filters here
 * that providers can't translate).
 *
 * Multi-value fields (`channel`, `workflowId`, `respondedBy`) are OR'd within
 * a field and AND'd across fields, mirroring the OpenAPI contract documented
 * at `kbn-inbox-common/impl/schemas/actions/list_history_route.schema.yaml`.
 */
export interface InboxActionProviderListProcessedParams extends InboxActionProviderListParams {
  /** Free-text search applied to responder / workflow / step labels (case-insensitive prefix). */
  q?: string;
  channel?: string[];
  workflowId?: string[];
  respondedBy?: string[];
  /** Sort direction on the responded-at / finished-at timestamp. Default: `'desc'`. */
  sortOrder?: 'asc' | 'desc';
}

export interface InboxActionProviderListResult {
  actions: InboxAction[];
  /**
   * Pre-pagination total for this provider. The registry sums these to report
   * an accurate cross-source total even when a page only surfaces results
   * from one provider.
   */
  total: number;
}

/**
 * Bucket shape providers return from {@link InboxActionProvider.listProcessedFacets}.
 * Mirrors `InboxActionFacetBucket` from the OpenAPI schema; each `value` is
 * paired with the per-provider document count so the registry can sum counts
 * when two providers happen to surface the same value (e.g. both contributing
 * rows tagged `channel: "slack"`).
 */
export interface InboxActionProviderFacetBucket {
  value: string;
  count: number;
}

/**
 * Result shape providers return from {@link InboxActionProvider.listProcessedFacets}.
 * Two fixed dimensions for now (`channel`, `respondedBy`) so the
 * inbox-history filter bar can render them without the registry needing
 * per-dimension contracts. Adding new dimensions requires a schema bump on
 * the inbox-common facets route, kept intentional.
 */
export interface InboxActionProviderFacetsResult {
  channel: InboxActionProviderFacetBucket[];
  respondedBy: InboxActionProviderFacetBucket[];
}

/**
 * Contract that any plugin wishing to contribute HITL entries to the Inbox
 * must implement. Aligns with the "channel extensibility" vision of the
 * HITL GA epic ([security-team#16712](https://github.com/elastic/security-team/issues/16712)).
 *
 * `respond(input)` is intentionally opaque — the payload shape is defined by
 * the `input_schema` on the matching `InboxAction`. The provider is
 * responsible for any downstream dispatch (e.g. resuming a workflow,
 * patching a rule, posting to Slack).
 */
export interface InboxActionProvider {
  readonly sourceApp: string;

  list(
    params: InboxActionProviderListParams,
    ctx: InboxRequestContext
  ): Promise<InboxActionProviderListResult>;

  /**
   * Returns processed (audit-log) inbox actions — i.e. items that have
   * already received a response or otherwise terminated. Optional so
   * providers can ship the pending-only contract first and add history in
   * a follow-up. Providers that don't implement this are silently skipped
   * by the registry's history fan-out.
   *
   * Receives the {@link InboxActionProviderListProcessedParams} filter bundle
   * so providers can push search/filter predicates into their native indexes
   * (rather than the registry post-filtering merged results, which would
   * inflate fan-out cost on large feeds).
   */
  listProcessed?(
    params: InboxActionProviderListProcessedParams,
    ctx: InboxRequestContext
  ): Promise<InboxActionProviderListResult>;

  /**
   * Distinct-value buckets used to populate the inbox-history filter
   * dropdowns (Channel, Responder). Providers compute these against the same
   * baseline scope as `listProcessed` (the space's processed history) but
   * intentionally without applying user-supplied filter predicates — the
   * dropdown options must stay stable as the user toggles other filters.
   * Optional so providers can ship without facet support; the registry merge
   * skips providers that don't implement it.
   */
  listProcessedFacets?(ctx: InboxRequestContext): Promise<InboxActionProviderFacetsResult>;

  respond(
    sourceId: string,
    input: Record<string, unknown>,
    ctx: InboxRequestContext
  ): Promise<void>;
}

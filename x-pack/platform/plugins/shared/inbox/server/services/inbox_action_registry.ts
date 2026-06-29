/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { InboxAction } from '@kbn/inbox-common';
import type {
  InboxActionProvider,
  InboxActionProviderFacetBucket,
  InboxActionProviderFacetsResult,
  InboxActionProviderListParams,
  InboxActionProviderListProcessedParams,
  InboxRequestContext,
} from './inbox_action_provider';

export interface InboxActionRegistryListParams extends InboxActionProviderListParams {
  sourceApp?: string;
  page: number;
  perPage: number;
}

export interface InboxActionRegistryListHistoryParams
  extends InboxActionProviderListProcessedParams {
  sourceApp?: string;
  page: number;
  perPage: number;
}

export interface InboxActionRegistryListResult {
  actions: InboxAction[];
  total: number;
}

export interface InboxActionRegistryListFacetsParams {
  /**
   * Restrict the fan-out to a single source app. When omitted the registry
   * queries every registered provider and merges their buckets per dimension.
   */
  sourceApp?: string;
}

export type InboxActionRegistryListFacetsResult = InboxActionProviderFacetsResult;

export interface UnknownInboxSourceAppError extends Error {
  readonly sourceApp: string;
}

export const isUnknownInboxSourceAppError = (error: unknown): error is UnknownInboxSourceAppError =>
  error instanceof Error && error.name === 'UnknownInboxSourceAppError';

const createUnknownInboxSourceAppError = (sourceApp: string): UnknownInboxSourceAppError => {
  const error = new Error(
    `No inbox action provider registered for sourceApp "${sourceApp}"`
  ) as UnknownInboxSourceAppError;
  error.name = 'UnknownInboxSourceAppError';
  (error as { sourceApp: string }).sourceApp = sourceApp;
  return error;
};

/**
 * Signals that an inbox action exists in our addressing scheme but is no
 * longer in a state that can accept a response — the underlying resource
 * (e.g. a workflow step) has already been advanced, cancelled, or
 * claimed by another responder.
 *
 * Provider implementations throw this so the framework can surface a
 * stable HTTP 409 Conflict back to the caller instead of a generic 500.
 * That, in turn, lets clients (UI, MCP, evals) distinguish "the action
 * is gone, refresh your inbox" from a real server error.
 *
 * Modeled as an `interface` + factory + type guard (rather than a
 * subclass) to mirror the colocated `UnknownInboxSourceAppError` and
 * keep this file under the `max-classes-per-file` lint cap.
 */
export interface InboxActionConflictError extends Error {
  readonly sourceApp: string;
  readonly sourceId: string;
}

export const isInboxActionConflictError = (error: unknown): error is InboxActionConflictError =>
  error instanceof Error && error.name === 'InboxActionConflictError';

export const createInboxActionConflictError = (
  sourceApp: string,
  sourceId: string,
  reason: string
): InboxActionConflictError => {
  const error = new Error(
    `Inbox action ${sourceApp}/${sourceId} can no longer accept a response: ${reason}`
  ) as InboxActionConflictError;
  error.name = 'InboxActionConflictError';
  (error as { sourceApp: string }).sourceApp = sourceApp;
  (error as { sourceId: string }).sourceId = sourceId;
  return error;
};

/**
 * Signals that a provider could not parse the `source_id` segment for its
 * namespace. This is a client/addressing error, not a provider outage, so the
 * route maps it to HTTP 400 instead of the generic 500 fallback.
 */
export interface InvalidInboxActionSourceIdError extends Error {
  readonly sourceApp: string;
  readonly sourceId: string;
}

export const isInvalidInboxActionSourceIdError = (
  error: unknown
): error is InvalidInboxActionSourceIdError =>
  error instanceof Error && error.name === 'InvalidInboxActionSourceIdError';

export const createInvalidInboxActionSourceIdError = (
  sourceApp: string,
  sourceId: string,
  expectedFormat: string
): InvalidInboxActionSourceIdError => {
  const error = new Error(
    `Inbox action ${sourceApp}/${sourceId} has an invalid source_id. Expected format: ${expectedFormat}.`
  ) as InvalidInboxActionSourceIdError;
  error.name = 'InvalidInboxActionSourceIdError';
  (error as { sourceApp: string }).sourceApp = sourceApp;
  (error as { sourceId: string }).sourceId = sourceId;
  return error;
};

/**
 * Fan-out + merge-sort + paginate registry. Each registered provider owns a
 * `sourceApp` namespace and handles its own storage. The registry is
 * deliberately dumb — it does not persist actions itself; it's a routing
 * layer that consumers of `@kbn/inbox-common` never see.
 */
export class InboxActionRegistry {
  private readonly providers = new Map<string, InboxActionProvider>();

  constructor(private readonly logger: Logger) {}

  register(provider: InboxActionProvider): void {
    if (this.providers.has(provider.sourceApp)) {
      throw new Error(
        `An inbox action provider for sourceApp "${provider.sourceApp}" is already registered`
      );
    }
    this.providers.set(provider.sourceApp, provider);
    this.logger.debug(`Registered inbox action provider for sourceApp "${provider.sourceApp}"`);
  }

  has(sourceApp: string): boolean {
    return this.providers.has(sourceApp);
  }

  async list(
    params: InboxActionRegistryListParams,
    ctx: InboxRequestContext
  ): Promise<InboxActionRegistryListResult> {
    return this.fanOutAndPaginate(params, ctx, {
      method: 'list',
      sortKey: (action) => action.created_at,
      sortOrder: 'desc',
      providerParams: { status: params.status },
    });
  }

  /**
   * History/audit-log fan-out. Providers that don't implement
   * {@link InboxActionProvider.listProcessed} are silently skipped, so the
   * inbox surface still works alongside providers that ship pending-only.
   *
   * Sort key is `responded_at ?? created_at` — when the responder timestamp
   * is missing (older rows, or providers that haven't been updated for the
   * audit fields) we fall back to the action's creation timestamp so ordering
   * stays stable. Direction follows `params.sortOrder` so the caller can
   * pivot the audit feed oldest-first when reviewing chronological context.
   */
  async listHistory(
    params: InboxActionRegistryListHistoryParams,
    ctx: InboxRequestContext
  ): Promise<InboxActionRegistryListResult> {
    const { status, q, channel, workflowId, respondedBy, sortOrder } = params;
    return this.fanOutAndPaginate(params, ctx, {
      method: 'listProcessed',
      sortKey: (action) => action.responded_at ?? action.created_at,
      sortOrder: sortOrder ?? 'desc',
      providerParams: { status, q, channel, workflowId, respondedBy, sortOrder },
    });
  }

  private async fanOutAndPaginate(
    params: InboxActionRegistryListParams | InboxActionRegistryListHistoryParams,
    ctx: InboxRequestContext,
    options: {
      method: 'list' | 'listProcessed';
      sortKey: (action: InboxAction) => string;
      sortOrder: 'asc' | 'desc';
      providerParams: InboxActionProviderListParams | InboxActionProviderListProcessedParams;
    }
  ): Promise<InboxActionRegistryListResult> {
    const { sourceApp, page, perPage } = params;
    const providerPageSize = page * perPage;
    const scoped = sourceApp ? this.providers.get(sourceApp) : undefined;
    const targetProviders = sourceApp
      ? scoped
        ? [scoped]
        : []
      : Array.from(this.providers.values());

    if (targetProviders.length === 0) {
      return { actions: [], total: 0 };
    }

    const { method, sortKey, sortOrder, providerParams } = options;

    const results = await Promise.all(
      targetProviders.map(async (provider) => {
        const handler = provider[method];
        // Providers can opt out of `listProcessed` (it's optional on the
        // contract). Treat missing implementations as "no rows from this
        // source" so the registry-level pagination stays consistent.
        if (typeof handler !== 'function') {
          return { actions: [], total: 0 };
        }
        try {
          const result = await handler.call(
            provider,
            {
              ...providerParams,
              page: 1,
              perPage: providerPageSize,
            } as never,
            ctx
          );
          // The registry fetches the first N rows from each provider, where N
          // is the end offset of the requested registry page. That is enough
          // material to merge-sort and produce this page while still reporting
          // each provider's true total. If a provider returns fewer rows than
          // requested while claiming more exist, keep the response usable but
          // log the contract mismatch because later pages may be incomplete.
          if (result.total > result.actions.length && result.actions.length < providerPageSize) {
            this.logger.warn(
              `Inbox action provider "${provider.sourceApp}" reported ${result.total} total but returned ${result.actions.length}. ` +
                `Registry pagination may be incomplete for this provider.`
            );
          }
          return result;
        } catch (err) {
          this.logger.error(
            `Inbox action provider "${provider.sourceApp}" failed to ${method}: ${err}`
          );
          return { actions: [], total: 0 };
        }
      })
    );

    // Default merge-sort is descending (most recent first); flip the
    // comparator on `asc` so the caller can pivot the audit feed oldest-first
    // when reviewing chronological context.
    const merged = results
      .flatMap((result) => result.actions)
      .sort((a, b) =>
        sortOrder === 'asc'
          ? sortKey(a).localeCompare(sortKey(b))
          : sortKey(b).localeCompare(sortKey(a))
      );

    const total = results.reduce((sum, result) => sum + result.total, 0);

    const start = (page - 1) * perPage;
    const end = start + perPage;

    return {
      actions: merged.slice(start, end),
      total,
    };
  }

  /**
   * Fan out across providers and merge per-dimension bucket lists for the
   * inbox-history filter dropdowns. Two providers may surface the same value
   * (e.g. both contributing rows tagged `channel: "slack"`) — we sum counts
   * so the UI sees a single, monotonically larger bucket. Providers that
   * don't implement {@link InboxActionProvider.listProcessedFacets} are
   * silently skipped, mirroring the optional-history-listing contract.
   *
   * Bucket arrays per dimension are sorted by descending count (with a value
   * tie-break) so the response is stable across requests.
   */
  async listFacets(
    params: InboxActionRegistryListFacetsParams,
    ctx: InboxRequestContext
  ): Promise<InboxActionRegistryListFacetsResult> {
    const { sourceApp } = params;
    const scoped = sourceApp ? this.providers.get(sourceApp) : undefined;
    const targetProviders = sourceApp
      ? scoped
        ? [scoped]
        : []
      : Array.from(this.providers.values());

    if (targetProviders.length === 0) {
      return { channel: [], respondedBy: [] };
    }

    const perProvider = await Promise.all(
      targetProviders.map(async (provider): Promise<InboxActionProviderFacetsResult> => {
        const handler = provider.listProcessedFacets;
        if (typeof handler !== 'function') {
          return { channel: [], respondedBy: [] };
        }
        try {
          return await handler.call(provider, ctx);
        } catch (err) {
          this.logger.error(
            `Inbox action provider "${provider.sourceApp}" failed to listProcessedFacets: ${err}`
          );
          return { channel: [], respondedBy: [] };
        }
      })
    );

    return {
      channel: mergeFacetBuckets(perProvider.map((r) => r.channel)),
      respondedBy: mergeFacetBuckets(perProvider.map((r) => r.respondedBy)),
    };
  }

  async respondTo(
    sourceApp: string,
    sourceId: string,
    input: Record<string, unknown>,
    ctx: InboxRequestContext
  ): Promise<void> {
    const provider = this.providers.get(sourceApp);
    if (!provider) {
      throw createUnknownInboxSourceAppError(sourceApp);
    }
    await provider.respond(sourceId, input, ctx);
  }
}

/**
 * Merge per-provider bucket arrays for a single facet dimension by summing
 * counts per `value`. Two providers contributing the same value (e.g.
 * `channel: "slack"`) collapse into one bucket whose count is the sum —
 * anything else would render the same chip twice in the UI dropdown. Empty
 * values are dropped defensively (the query service already filters them, but
 * the registry is a public boundary). Result is sorted by descending count,
 * then by value for stable tie-breaks across requests.
 */
const mergeFacetBuckets = (
  perProvider: InboxActionProviderFacetBucket[][]
): InboxActionProviderFacetBucket[] => {
  const totals = new Map<string, number>();
  for (const buckets of perProvider) {
    for (const bucket of buckets) {
      if (!bucket.value) {
        continue;
      }
      totals.set(bucket.value, (totals.get(bucket.value) ?? 0) + bucket.count);
    }
  }
  return Array.from(totals.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import type { Alert } from '@kbn/alerting-types';

/**
 * A reference to a document currently displayed in a flyout. Used by
 * non-alerts sources (e.g. timeline) where the document may not be an
 * `Alert` and cannot be pushed through the alerts-only `flyoutAlert` slot.
 */
export interface FlyoutDocumentRef {
  readonly id: string;
  readonly indexName: string;
}

/**
 * Per-source-instance pagination slice. Each mounted source (alerts table,
 * timeline data table, etc.) owns exactly one slice, keyed by a UUID that
 * it mints at mount time. The shape is intentionally flat and immutable so
 * that `useSyncExternalStore` consumers get a new reference on every
 * mutation and re-render reliably.
 */
export interface ScopedPaginationSlice {
  /**
   * Absolute index (across all pages / loaded rows) of the document
   * currently shown in the flyout, or `null` when no document is expanded.
   * Drives `activePage` of the in-flyout `EuiPagination`.
   */
  readonly flyoutAlertIndex: number | null;
  /** Current page size of the response-ops alerts table (alerts table only). */
  readonly pageSize: number;
  /**
   * Total number of documents in the source's loaded set. Drives
   * `pageCount` of the in-flyout `EuiPagination`.
   */
  readonly totalAlertCount: number;
  /**
   * `true` while the alert at `flyoutAlertIndex` belongs to a different page
   * than the table is currently displaying and is being fetched. Consumers
   * (the right panel) should render a centered loading spinner instead of
   * stale alert content.
   */
  readonly isFlyoutAlertLoading: boolean;
  /**
   * Resolved alert document at `flyoutAlertIndex`, or `null` while no alert
   * is expanded. Used by `PaginatedDocumentFlyout` to render the current
   * alert directly, without an extra `useEsDocSearch` round-trip.
   */
  readonly flyoutAlert: Alert | null;
  /**
   * Reference to the document currently shown in the flyout for non-alert
   * sources (timeline). Used by `PaginatedTimelineDocumentFlyout` to drive
   * `DocumentFlyoutWrapper` with the correct `documentId`/`indexName`.
   */
  readonly flyoutDocumentRef: FlyoutDocumentRef | null;
  /**
   * Implementation registered by the source that opens (or swaps) the
   * document-details flyout for a given absolute index. Lives in the store
   * rather than a React ref so that V2 flyout content mounted in a separate
   * React root via `overlays.openSystemFlyout` can still dispatch.
   *
   * `null` when no implementation is registered; callers treat that as a
   * no-op.
   */
  readonly openAlertFlyoutImpl: ((alertIndex: number) => void) | null;
}

/**
 * Sentinel returned when the requested slice id is `null`, `undefined`, or
 * unknown. Consumers that receive this value render no pagination.
 * Exporting it lets consumers compare by identity instead of by value.
 */
export const absentSlice: ScopedPaginationSlice = {
  flyoutAlertIndex: null,
  pageSize: 0,
  totalAlertCount: 0,
  isFlyoutAlertLoading: false,
  flyoutAlert: null,
  flyoutDocumentRef: null,
  openAlertFlyoutImpl: null,
};

/**
 * Value exposed by `useFlyoutPagination`. Extends `ScopedPaginationSlice`
 * with a stable `openAlertFlyout` wrapper that dispatches through the
 * registered `openAlertFlyoutImpl`.
 */
export interface FlyoutPaginationValue extends ScopedPaginationSlice {
  /**
   * Stable wrapper around the slice's `openAlertFlyoutImpl`. Calling this
   * from the in-flyout `EuiPagination` is the single dispatch path for
   * swapping the displayed document. No-ops when the slice has no registered
   * implementation or when `instanceId` is absent.
   */
  readonly openAlertFlyout: (alertIndex: number) => void;
}

// ---------------------------------------------------------------------------
// usePaginatedFlyout types
// ---------------------------------------------------------------------------

/**
 * The resolved document returned by the `onOpen` callback.
 *
 * `id`, `indexName`, and `scopeId` are the document coordinates; the hook
 * uses them directly as V1 expandable-flyout panel params (injecting
 * `paginationInstanceId` automatically). They are not needed for V2, which
 * drives navigation purely through slice updates.
 *
 * Return `null` from `onOpen` when the document at `alertIndex` is on a
 * different table page and isn't in memory yet. The hook will write
 * `flyoutAlertIndex` to the slice (showing a loading state) and skip the V1
 * open; the source's resolution effect calls `openPaginatedFlyout` again
 * with the concrete result once the parallel query completes.
 */
export interface OnOpenResult {
  readonly id: string;
  readonly indexName: string;
  readonly scopeId: string;
  /** Optional slice fields to merge alongside `flyoutAlertIndex`. */
  readonly stateUpdate?: Partial<ScopedPaginationSlice>;
}

/**
 * Options for the `usePaginatedFlyout` writer hook.
 *
 * Only source-specific values are required here. Infrastructure concerns
 * (feature flags, expandable-flyout API, Kibana services, Redux store,
 * React Router history, flyout default properties) are resolved internally
 * via hooks so consumers stay unaware of V1 vs V2 routing.
 */
export interface UsePaginatedFlyoutOptions {
  /**
   * V1 only. Key used by the expandable flyout's panel registry to look up
   * the right panel component (e.g. `DocumentDetailsRightPanelKey`). Unused
   * when V2 is enabled; can be removed once V1 is dropped.
   */
  readonly rightPanelKey: string;
  /**
   * Resolves the document at the given absolute index from the source's
   * current in-memory data. Returns the document coordinates and any slice
   * fields to pre-populate, or `null` when the document is on a different
   * page and is not yet in memory — the hook will write `flyoutAlertIndex`
   * (showing a loading state) and the source's cross-page resolution effect
   * should call `openPaginatedFlyout` again once the fetch completes.
   */
  readonly resolveDocument?: (alertIndex: number) => OnOpenResult | null;
  /**
   * Factory that creates the flyout body element. Receives the stable
   * `paginationInstanceId` so it can thread it into the paginated wrapper.
   */
  readonly renderBody: (paginationInstanceId: string) => React.ReactNode;
  /** History key for the V2 system flyout session. Must be a Symbol as required by the overlays API. */
  readonly historyKey: symbol;
  /** Optional callback invoked when the V2 system flyout is closed externally. */
  readonly onClose?: () => void;
}

/**
 * Values returned by `usePaginatedFlyout`.
 */
export interface UsePaginatedFlyoutReturn {
  /**
   * Stable per-source-instance UUID minted once at mount. Thread this
   * through flyout open params → `DocumentDetailsContext` → header.
   */
  readonly paginationInstanceId: string;
  /**
   * Current snapshot of this source's pagination slice, subscribed via
   * `useSyncExternalStore`. Includes the stable `openAlertFlyout` wrapper.
   * Re-renders only when this source's slice changes.
   */
  readonly slice: FlyoutPaginationValue;
  /**
   * Merge a partial update into this source's pagination slice. Equivalent
   * to `flyoutPaginationStore.setSlice(paginationInstanceId, partial)` but
   * routed through the hook so the source never touches the store directly.
   */
  readonly setState: (partial: Partial<ScopedPaginationSlice>) => void;
  /**
   * Open (or navigate) the paginated flyout to `alertIndex`.
   *
   * - Always sets `flyoutAlertIndex` in the slice.
   * - V2: opens the system flyout on the first call; subsequent calls just
   *   update the slice (the V2 body re-renders from the store).
   * - V1: calls `openFlyout` when V1 params are available (either from
   *   `explicitResult.v1Params` or from `onOpen(alertIndex)`).
   */
  readonly openPaginatedFlyout: (alertIndex: number, explicitResult?: OnOpenResult) => void;
  /**
   * Soft-reset this source's pagination slice (clear displayed-document
   * fields: `flyoutAlertIndex`, `flyoutAlert`, `flyoutDocumentRef`,
   * `isFlyoutAlertLoading`, `totalAlertCount`) and close any open V2 system
   * flyout. The slice itself is NOT removed — `openAlertFlyoutImpl` and
   * `pageSize` survive so the source can call `openPaginatedFlyout` again
   * without re-registering. Call this from the V1 expandable-flyout `onClose`
   * handler and the V2 system-flyout `onClose` handler. Full slice removal on
   * unmount is auto-handled by the hook.
   */
  readonly closePaginatedFlyout: () => void;
}

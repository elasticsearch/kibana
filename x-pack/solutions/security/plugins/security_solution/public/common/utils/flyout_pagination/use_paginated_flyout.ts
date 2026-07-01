/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import { flyoutPaginationStore } from './store';
import { useFlyoutPagination } from './use_flyout_pagination';
import { flyoutProviders } from '../../../flyout_v2/shared/components/flyout_provider';
import { useIsExperimentalFeatureEnabled } from '../../hooks/use_experimental_features';
import { useKibana } from '../../lib/kibana';
import { useDefaultDocumentFlyoutProperties } from '../../../flyout_v2/shared/hooks/use_default_flyout_properties';
import type {
  OnOpenResult,
  ScopedPaginationSlice,
  UsePaginatedFlyoutOptions,
  UsePaginatedFlyoutReturn,
} from './types';

/**
 * Soft-reset payload applied by `closePaginatedFlyout` and the V2 internal
 * `onClose`. Clears every displayed-document field without removing the slice,
 * so that the registered `openAlertFlyoutImpl` and `pageSize` survive across
 * open/close cycles. The `Partial<ScopedPaginationSlice>` annotation surfaces
 * a compile-time error if a future field addition needs to be handled here.
 */
const SOFT_RESET: Partial<ScopedPaginationSlice> = {
  flyoutAlertIndex: null,
  flyoutAlert: null,
  flyoutDocumentRef: null,
  isFlyoutAlertLoading: false,
  totalAlertCount: 0,
};

/**
 * Writer hook for paginated flyout sources (alerts table, timeline).
 *
 * Responsibilities:
 * - Mints a stable per-source-instance UUID at mount.
 * - Subscribes to its own slice via `useFlyoutPagination` and returns it as
 *   `slice`.
 * - Exposes `setState` so the source can write to the slice without touching
 *   `flyoutPaginationStore` directly.
 * - Resolves the V1/V2 routing internally (feature flag, expandable-flyout
 *   API, Kibana services) so callers never handle that branching themselves.
 * - Manages the V2 system flyout lifecycle: opens it once on the first
 *   `openPaginatedFlyout` call and reuses it; auto-closes on unmount.
 * - Registers `openAlertFlyoutImpl` in the slice so the in-flyout
 *   `EuiPagination` can dispatch back through `openPaginatedFlyout`.
 * - Auto-removes the slice on unmount.
 *
 * Sources MUST NOT call `flyoutPaginationStore.setSlice` / `removeSlice` or
 * the flyout open APIs directly. All writes go through `setState` /
 * `openPaginatedFlyout` / `closePaginatedFlyout`.
 */
export const usePaginatedFlyout = ({
  rightPanelKey,
  resolveDocument,
  renderBody,
  historyKey,
  onClose,
}: UsePaginatedFlyoutOptions): UsePaginatedFlyoutReturn => {
  // Stable id: minted once at mount, never changes. Using a ref ensures the
  // id survives re-renders and is serialisable into V2 system flyout params
  // (unlike React's `useId` which is only stable within the same React tree).
  const paginationInstanceId = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  ).current;

  // Resolved here so callers don't have to pass V1/V2 infrastructure as props.
  const v2Enabled = useIsExperimentalFeatureEnabled('newFlyoutSystemEnabled');
  const { openFlyout } = useExpandableFlyoutApi();
  const { services } = useKibana();
  const { overlays } = services;
  const store = useStore();
  const history = useHistory();
  const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();

  // Tracks the currently-open V2 system flyout overlay so we can reuse it
  // across subsequent `openPaginatedFlyout` calls.
  const v2OverlayRef = useRef<OverlayRef | null>(null);

  // `resolveDocument` closes over mutable React state (e.g. tableContext,
  // tablePageIndex) and will always change identity when that state updates —
  // even when correctly memoized by the caller. Reading it through a ref lets
  // `openPaginatedFlyout` (and its useEffect registration) stay stable without
  // capturing a stale closure. This is the same pattern as React's proposed
  // `useEffectEvent`.
  const resolveDocumentRef = useRef(resolveDocument);
  resolveDocumentRef.current = resolveDocument;

  const openFlyoutRef = useRef(openFlyout);
  openFlyoutRef.current = openFlyout;

  // Bundle all infrastructure values that are used inside `openPaginatedFlyout`
  // into a single ref so the callback doesn't need them in its deps array.
  // These are all stable at runtime (services / store / history don't change).
  const infraRef = useRef({
    overlays,
    services,
    store,
    history,
    defaultFlyoutProperties,
    renderBody,
    onClose,
  });
  infraRef.current = {
    overlays,
    services,
    store,
    history,
    defaultFlyoutProperties,
    renderBody,
    onClose,
  };

  // Subscribe to this source's own slice (read path). The returned value
  // includes the stable `openAlertFlyout` wrapper for in-flyout EuiPagination.
  const slice = useFlyoutPagination(paginationInstanceId);

  const setState = useCallback((partial: Partial<ScopedPaginationSlice>): void => {
    flyoutPaginationStore.setSlice(paginationInstanceId, partial);
    // paginationInstanceId is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closePaginatedFlyout = useCallback((): void => {
    // Soft-reset: clear displayed-document fields but keep the slice alive so
    // that the `openAlertFlyoutImpl` registered at mount survives and can be
    // used again on the next open. Real teardown (removeSlice) happens only on
    // the hook's unmount cleanup effect.
    flyoutPaginationStore.setSlice(paginationInstanceId, SOFT_RESET);
    if (v2OverlayRef.current) {
      v2OverlayRef.current.close();
      v2OverlayRef.current = null;
    }
    // paginationInstanceId is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPaginatedFlyout = useCallback(
    (alertIndex: number, explicitResult?: OnOpenResult): void => {
      // Resolve the document at alertIndex. Explicit params take precedence
      // over the `onOpen` callback (used for cross-page resolution effects
      // that already have the document data ready).
      const doc = explicitResult ?? resolveDocumentRef.current?.(alertIndex) ?? null;

      // Always update flyoutAlertIndex and any additional slice fields the
      // source wants to write alongside the open (e.g. flyoutAlert for V2).
      flyoutPaginationStore.setSlice(paginationInstanceId, {
        flyoutAlertIndex: alertIndex,
        ...(doc?.stateUpdate ?? {}),
      });

      if (v2Enabled) {
        // V2: open the system flyout once; subsequent calls just update the
        // slice and the inner component re-renders from the store.
        if (v2OverlayRef.current) return;
        const {
          overlays: infraOverlays,
          services: infraServices,
          store: infraStore,
          history: infraHistory,
          defaultFlyoutProperties: infraDefaultProps,
          renderBody: infraRenderBody,
          onClose: infraOnClose,
        } = infraRef.current;
        v2OverlayRef.current = infraOverlays.openSystemFlyout(
          flyoutProviders({
            services: infraServices,
            store: infraStore,
            history: infraHistory,
            children: infraRenderBody(paginationInstanceId),
          }),
          {
            ...infraDefaultProps,
            historyKey,
            session: 'start',
            onClose: (flyout: OverlayRef) => {
              flyout.close();
              v2OverlayRef.current = null;
              // Same soft-reset as closePaginatedFlyout: keep the slice (and
              // its openAlertFlyoutImpl) alive for the next open cycle.
              flyoutPaginationStore.setSlice(paginationInstanceId, SOFT_RESET);
              infraOnClose?.();
            },
          }
        );
        return;
      }

      // V1: open the right panel with the resolved document coordinates.
      // When doc is null (cross-page before the alert loads), skip the open —
      // the source's resolution effect will call openPaginatedFlyout again
      // with the concrete result once the parallel query completes.
      if (!doc) return;
      openFlyoutRef.current({
        right: {
          id: rightPanelKey,
          params: {
            id: doc.id,
            indexName: doc.indexName,
            scopeId: doc.scopeId,
            paginationInstanceId,
          },
        },
      });
    },
    // paginationInstanceId and historyKey are stable (UUID + constant Symbol).
    // v2Enabled and rightPanelKey come from feature flags / constants and are
    // treated as stable for the hook's lifetime. Mutable values are read
    // through refs (onOpenRef, openFlyoutRef, infraRef).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [v2Enabled, rightPanelKey, historyKey]
  );

  // Register `openAlertFlyoutImpl` in the slice so the in-flyout
  // `EuiPagination` (which calls `useFlyoutPagination.openAlertFlyout`) can
  // dispatch back through `openPaginatedFlyout`.
  useEffect(() => {
    flyoutPaginationStore.setSlice(paginationInstanceId, {
      openAlertFlyoutImpl: (alertIndex: number) => openPaginatedFlyout(alertIndex),
    });
    return () => {
      flyoutPaginationStore.setSlice(paginationInstanceId, { openAlertFlyoutImpl: null });
    };
    // paginationInstanceId is stable; openPaginatedFlyout is stable for the
    // hook's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPaginatedFlyout]);

  // Auto-remove the slice and close the V2 overlay on unmount. This is the
  // cleanest lifecycle path: navigation away from the source page fires
  // the cleanup before any other effects, so downstream consumers don't see
  // stale state.
  useEffect(() => {
    return () => {
      flyoutPaginationStore.removeSlice(paginationInstanceId);
      if (v2OverlayRef.current) {
        v2OverlayRef.current.close();
        v2OverlayRef.current = null;
      }
    };
    // paginationInstanceId is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    paginationInstanceId,
    slice,
    setState,
    openPaginatedFlyout,
    closePaginatedFlyout,
  };
};

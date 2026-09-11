/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { getFlyoutManagerStore, useGeneratedHtmlId } from '@elastic/eui';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import { createPaginationStore } from './store';
import { PaginationStoreProvider } from './context';
import { useDefaultDocumentFlyoutProperties } from '../../shared/hooks/use_default_flyout_properties';
import { useOpenFlyout } from '../../shared/hooks/use_open_flyout';
import { FLYOUT_SESSION_KIND, FLYOUT_SURFACE, FLYOUT_TYPE } from '../../../common/lib/telemetry';
import type {
  ScopedPaginationSlice,
  UsePaginatedFlyoutOptions,
  UsePaginatedFlyoutReturn,
} from './types';

/**
 * Soft-reset payload applied by `closePaginatedFlyout` and the V2 internal
 * `onClose`. Clears every displayed-document field without touching the store
 * instance, so that the registered `openDocumentFlyoutImpl` survives across
 * open/close cycles.
 */
const SOFT_RESET: Partial<ScopedPaginationSlice> = {
  flyoutDocumentIndex: null,
  flyoutDocumentId: null,
  flyoutDocumentIndexName: null,
  isFlyoutDocumentLoading: false,
  hasFlyoutQueryError: false,
};

/**
 * Writer hook for paginated flyout sources (alerts table, timeline).
 *
 * Responsibilities:
 * - Creates an isolated per-instance `PaginationStore` in a ref.
 * - Subscribes to that store directly (source lives outside the provider).
 * - Wraps the flyout body in `<PaginationStoreProvider>` before opening.
 * - Manages the V2 system flyout lifecycle.
 * - Registers `openDocumentFlyoutImpl` in the store.
 * - Exposes `openDocumentFlyout` so consumers can dispatch opens without
 *   touching the store directly.
 *
 * Two entry points open a document, and they differ in how they treat an overlay that is
 * already open:
 * - `openDocumentFlyout` is the *source* entry point (a table row). It starts a fresh
 *   session, replacing anything the user has stacked on top of the flyout.
 * - `openPaginatedFlyout` is the *in-flyout* entry point (the header `EuiPagination`, and
 *   the source's cross-page resolution effect). It swaps the displayed document into the
 *   open overlay.
 */
export const usePaginatedFlyout = ({
  resolveDocument,
  renderBody,
  historyKey,
  origin,
  onClose,
}: UsePaginatedFlyoutOptions): UsePaginatedFlyoutReturn => {
  // Per-instance store created once at mount. Lives in a ref so it never
  // changes identity and its subscribe/getSnapshot are stable.
  const storeRef = useRef(createPaginationStore());

  // Subscribe directly (not via context) because this hook runs in the source
  // tree, outside any PaginationStoreProvider.
  const rawSlice = useSyncExternalStore(
    storeRef.current.subscribe,
    storeRef.current.getSnapshot,
    storeRef.current.getSnapshot
  );

  const openFlyout = useOpenFlyout();
  const defaultFlyoutProperties = useDefaultDocumentFlyoutProperties();

  const v2OverlayRef = useRef<OverlayRef | null>(null);

  // Stable EUI id for the overlay this hook opens, so `ownsTheScreen` can look the flyout up
  // in the flyout manager. Unique per hook instance, which keeps concurrently mounted sources
  // (alerts table and Timeline) from resolving to each other's flyout.
  const flyoutId = useGeneratedHtmlId({ prefix: 'paginatedDocumentFlyout' });

  // `true` when the paginated flyout still owns the screen: it is the current session's main
  // flyout, nothing is nested inside it, and no earlier session shares its history group.
  // Only then does swapping a new document into the open overlay show that document to the
  // user. In every other case the overlay is backgrounded — a tool flyout stacked a new
  // session on top of it (EUI appends a session for a main flyout, it never closes the
  // previous one), or a document was opened as its child — and reusing it would silently
  // repoint a flyout the user cannot see.
  const ownsTheScreen = useCallback((): boolean => {
    const { sessions } = getFlyoutManagerStore().getState();
    const currentSession = sessions[sessions.length - 1];
    return (
      currentSession?.mainFlyoutId === flyoutId &&
      currentSession.childFlyoutId == null &&
      sessions.every((session) => session === currentSession || session.historyKey !== historyKey)
    );
  }, [flyoutId, historyKey]);

  // `resolveDocument` closes over mutable React state and will change identity
  // on every render. Reading through a ref lets the stable `openPaginatedFlyout`
  // always call the latest version.
  const resolveDocumentRef = useRef(resolveDocument);
  resolveDocumentRef.current = resolveDocument;

  // Bundle mutable infra values so the stable `openPaginatedFlyout` never
  // captures a stale closure.
  const infraRef = useRef({ openFlyout, defaultFlyoutProperties, renderBody, origin, onClose });
  infraRef.current = { openFlyout, defaultFlyoutProperties, renderBody, origin, onClose };

  const setState = useCallback((partial: Partial<ScopedPaginationSlice>): void => {
    storeRef.current.setState(partial);
    // storeRef.current is stable
  }, []);

  const closePaginatedFlyout = useCallback((): void => {
    storeRef.current.setState(SOFT_RESET);
    if (v2OverlayRef.current) {
      v2OverlayRef.current.close();
      v2OverlayRef.current = null;
    }
    // storeRef.current is stable
  }, []);

  const openPaginatedFlyout = useCallback(
    (documentIndex: number, explicitStateUpdate?: Partial<ScopedPaginationSlice>): void => {
      const stateUpdate =
        explicitStateUpdate ?? resolveDocumentRef.current?.(documentIndex) ?? null;

      storeRef.current.setState({
        flyoutDocumentIndex: documentIndex,
        ...(stateUpdate ?? {}),
      });

      if (v2OverlayRef.current) return;
      const {
        openFlyout: infraOpenFlyout,
        defaultFlyoutProperties: infraDefaultProps,
        renderBody: infraRenderBody,
        origin: infraOrigin,
        onClose: infraOnClose,
      } = infraRef.current;
      const store = storeRef.current;
      v2OverlayRef.current = infraOpenFlyout(
        React.createElement(PaginationStoreProvider, { value: store }, infraRenderBody()),
        {
          ...infraDefaultProps,
          id: flyoutId,
          historyKey,
          session: FLYOUT_SESSION_KIND.START,
          onClose: (flyout: OverlayRef) => {
            flyout.close();
            v2OverlayRef.current = null;
            store.setState(SOFT_RESET);
            infraOnClose?.();
          },
        },
        {
          surface: FLYOUT_SURFACE.FLYOUT,
          flyoutType: FLYOUT_TYPE.DOCUMENT,
          session: FLYOUT_SESSION_KIND.START,
          origin: infraOrigin,
        }
      );
    },
    // historyKey and flyoutId are stable. Mutable values are read through refs.
    // storeRef.current is stable.

    [historyKey, flyoutId]
  );

  // Register `openDocumentFlyoutImpl` so the in-flyout `EuiPagination` can
  // dispatch back through `openPaginatedFlyout` across the separate React root.
  useEffect(() => {
    const store = storeRef.current;
    store.setState({
      openDocumentFlyoutImpl: (documentIndex: number) => openPaginatedFlyout(documentIndex),
    });
    return () => {
      store.setState({ openDocumentFlyoutImpl: null });
    };
  }, [openPaginatedFlyout]);

  // Close the overlay on unmount (navigation away from the source page).
  useEffect(() => {
    const store = storeRef.current;
    return () => {
      store.setState(SOFT_RESET);
      if (v2OverlayRef.current) {
        v2OverlayRef.current.close();
        v2OverlayRef.current = null;
      }
    };
  }, []);

  const openDocumentFlyout = useCallback(
    (documentIndex: number): void => {
      // Opening from the source (a table row) starts a fresh session. When the overlay no
      // longer owns the screen, closing it makes EUI drop every flyout in this history group,
      // so the new document replaces that stack instead of leaving the tool/child flyout on
      // top of it. When it does own the screen the document is swapped in place, which avoids
      // remounting the flyout and keeps the history group free of a Back button.
      if (v2OverlayRef.current && !ownsTheScreen()) {
        v2OverlayRef.current.close();
        v2OverlayRef.current = null;
      }
      openPaginatedFlyout(documentIndex);
    },
    [openPaginatedFlyout, ownsTheScreen]
  );

  const slice = useMemo(
    () => ({ ...rawSlice, openDocumentFlyout }),
    [rawSlice, openDocumentFlyout]
  );

  return { slice, setState, openPaginatedFlyout, closePaginatedFlyout, openDocumentFlyout };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { DataTableRecord } from '@kbn/discover-utils';
import { ElasticRequestState } from '@kbn/unified-doc-viewer';
import { useEsDocSearch } from '@kbn/unified-doc-viewer-plugin/public';

export interface UseResolvedDocumentParams {
  /**
   * The `_id` of the document to resolve.
   */
  documentId: string | undefined;
  /**
   * The concrete index the document lives in.
   */
  indexName: string | undefined;
  /**
   * Data view the document is resolved against.
   */
  dataView: DataView;
  /**
   * `true` when the document cannot be fetched yet (no id/index, or the data view isn't usable).
   */
  skip: boolean;
}

export interface ResolvedDocument {
  /**
   * Raw request state of the underlying document search.
   */
  requestState: ElasticRequestState;
  /**
   * Document to render: the requested one once it has arrived, otherwise the last one that did
   * resolve. `null` until the very first document resolves.
   */
  displayedHit: DataTableRecord | null;
  /**
   * `true` while `displayedHit` is not (yet) the requested document.
   */
  isResolving: boolean;
  /**
   * `true` while resolving a document with an already resolved one still on screen. Callers use it
   * to keep the flyout mounted — and with it the header's pagination controls — instead of tearing
   * the whole panel down for a spinner.
   */
  isReloading: boolean;
  /**
   * Refetches the current document, e.g. after an alert mutation.
   */
  refetchDocument: () => void;
}

/**
 * Resolves a single document by id, tracking whether what it returns is the document that was
 * asked for.
 *
 * `useEsDocSearch` never reports `Loading` again once it has resolved something: when its `id`
 * changes it keeps returning `Found` with the previously fetched hit until the new response lands.
 * Comparing the resolved hit's `_id` with the requested one is therefore the only reliable way to
 * tell "showing the requested document" from "still fetching it" — without it a paginated flyout
 * keeps the previous document fully rendered while its pagination control already points at the
 * new position, which on a slow connection reads as if nothing happened.
 */
export const useResolvedDocument = ({
  documentId,
  indexName,
  dataView,
  skip,
}: UseResolvedDocumentParams): ResolvedDocument => {
  const [requestState, hit, refetchDocument] = useEsDocSearch({
    id: documentId ?? '',
    index: indexName,
    dataView,
    skip,
  });

  // Last document that resolved. Keeping it around lets callers re-render around it while the next
  // one is being fetched, instead of unmounting the flyout.
  const lastResolvedHit = useRef<DataTableRecord | null>(null);
  useEffect(() => {
    if (requestState === ElasticRequestState.Found && hit) {
      lastResolvedHit.current = hit;
    }
  }, [hit, requestState]);

  // A terminal outcome is the answer for the requested document, so it must not be read as "still
  // resolving" even though no hit matches the requested id.
  const hasSettled =
    requestState === ElasticRequestState.NotFound ||
    requestState === ElasticRequestState.Error ||
    requestState === ElasticRequestState.NotFoundDataView;
  const isResolving =
    requestState === ElasticRequestState.Loading ||
    (!skip && !hasSettled && hit?.raw._id !== documentId);

  return {
    requestState,
    displayedHit: hit ?? lastResolvedHit.current,
    isResolving,
    isReloading: isResolving && lastResolvedHit.current != null,
    refetchDocument,
  };
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useMemo } from 'react';
import { EuiSpacer } from '@elastic/eui';
import type { APIReturnType } from '@kbn/apm-api-shared';
import type {
  TraceItem,
  WaterfallGetErrorMarkerHref,
  WaterfallGetServiceBadgeHref,
} from '@kbn/apm-types';
import { TraceWaterfall } from '../trace_waterfall';
import { TraceSummary } from './trace_summary';

type FocusedTrace = APIReturnType<'GET /internal/apm/unified_traces/{traceId}/summary'>;

interface Props {
  items: FocusedTrace;
  isEmbeddable?: boolean;
  engine?: 'dom' | 'charts';
  onErrorClick?: (params: { traceId: string; docId: string }) => void;
  getServiceBadgeHref?: WaterfallGetServiceBadgeHref;
  getErrorMarkerHref?: WaterfallGetErrorMarkerHref;
}

export function flattenChildren(
  children: NonNullable<FocusedTrace['traceItems']>['focusedTraceTree']
) {
  function convert(
    child: NonNullable<FocusedTrace['traceItems']>['focusedTraceTree'][0]
  ): Array<NonNullable<FocusedTrace['traceItems']>['rootDoc']> {
    const convertedChildren = child.children?.length ? child.children.flatMap(convert) : [];
    return [child.traceDoc, ...convertedChildren];
  }

  return children.flatMap(convert);
}

export function reparentDocumentToRoot(items: FocusedTrace['traceItems']) {
  if (!items) {
    return undefined;
  }
  const clonedItems = structuredClone(items);
  const rootDocId = clonedItems.rootDoc.id;

  if (rootDocId === clonedItems.focusedTraceDoc.id || rootDocId === clonedItems.parentDoc?.id) {
    return clonedItems;
  }

  if (clonedItems.parentDoc) {
    clonedItems.parentDoc.parentId = rootDocId;
  } else {
    clonedItems.focusedTraceDoc.parentId = rootDocId;
  }
  return clonedItems;
}

function getTraceItems(items: NonNullable<FocusedTrace['traceItems']>) {
  const children = items.focusedTraceTree || [];
  const childrenItems = flattenChildren(children);

  const traceItems = [
    items.rootDoc,
    items.parentDoc?.id === items.rootDoc.id ? undefined : items.parentDoc,
    items.focusedTraceDoc.id === items.rootDoc.id ? undefined : items.focusedTraceDoc,
    ...childrenItems,
  ].filter(Boolean) as TraceItem[];

  return traceItems;
}

export function FocusedTraceWaterfall({
  items,
  engine,
  onErrorClick,
  isEmbeddable,
  getServiceBadgeHref,
  getErrorMarkerHref,
}: Props) {
  const reparentedItems = reparentDocumentToRoot(items.traceItems);
  const traceItems = reparentedItems ? getTraceItems(reparentedItems) : [];
  const contextSpanIds = useMemo(
    () => (reparentedItems?.focusedTraceDoc.id ? [reparentedItems.focusedTraceDoc.id] : undefined),
    [reparentedItems?.focusedTraceDoc.id]
  );

  return (
    <>
      <TraceWaterfall
        traceItems={traceItems}
        showAccordion={false}
        contextSpanIds={contextSpanIds}
        engine={engine}
        onErrorClick={onErrorClick}
        isEmbeddable={isEmbeddable}
        getServiceBadgeHref={getServiceBadgeHref}
        getErrorMarkerHref={getErrorMarkerHref}
      />
      {reparentedItems ? (
        <>
          <EuiSpacer />
          <TraceSummary summary={items.summary} />
        </>
      ) : null}
    </>
  );
}

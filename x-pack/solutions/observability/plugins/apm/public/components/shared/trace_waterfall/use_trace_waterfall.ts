/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { euiPaletteColorBlind } from '@elastic/eui';
import type { Error } from '@kbn/apm-types';
import { i18n } from '@kbn/i18n';
import { useMemo } from 'react';
import { getTimestampUs } from '../../../../common/utils/get_timestamp_us';
import { WaterfallLegendType, type IWaterfallLegend } from '../../../../common/waterfall/legend';
import type { TraceItem } from '../../../../common/waterfall/unified_trace_item';
import type { OnErrorClick } from './trace_waterfall_context';
import type { ErrorMark } from '../charts/timeline/marker/error_marker';

const FALLBACK_WARNING = i18n.translate(
  'xpack.apm.traceWaterfallItem.warningMessage.fallbackWarning',
  {
    defaultMessage:
      'The trace document is incomplete and not all spans have arrived yet. Try refreshing the page or adjusting the time range.',
  }
);

const INSTRUMENTATION_WARNING = i18n.translate(
  'xpack.apm.traceWaterfallItem.euiCallOut.aDuplicatedSpanWasLabel',
  {
    defaultMessage:
      'A duplicated span was detected. This indicates a problem with how your services have been instrumented, as span IDs are meant to be unique.',
  }
);

export interface TraceWaterfallItem extends TraceItem {
  depth: number;
  offset: number;
  skew: number;
  color: string;
  isOrphan?: boolean;
}

export function useTraceWaterfall({
  traceItems,
  isFiltered = false,
  errors,
  onErrorClick,
  entryTransactionId,
}: {
  traceItems: TraceItem[];
  isFiltered?: boolean;
  errors?: Error[];
  onErrorClick?: OnErrorClick;
  entryTransactionId?: string;
}) {
  const waterfall = useMemo(() => {
    try {
      const traceParentChildrenMap = getTraceParentChildrenMap(traceItems, isFiltered);
      const { rootItem, traceState, orphans } = getRootItemOrFallback(
        traceParentChildrenMap,
        traceItems,
        entryTransactionId
      );

      // Why this strategy? Build the filtered subtree first, then use it to derive legends and colors.
      // This ensures legends only contain services/types from the visible subtree,
      // not from the entire trace (which may include unrelated roots or excluded items).
      const rawWaterfall = rootItem
        ? getTraceWaterfall({
            rootItem,
            parentChildMap: traceParentChildrenMap,
            orphans,
          })
        : [];

      const legends = getLegends(rawWaterfall);
      const colorBy = getColorByType(legends);
      const colorMap = createColorLookupMap(legends);
      const traceWaterfall: TraceWaterfallItem[] = rawWaterfall.map((item) => ({
        ...item,
        color:
          colorBy === WaterfallLegendType.ServiceName
            ? colorMap.get(`${WaterfallLegendType.ServiceName}:${item.serviceName}`) ?? ''
            : colorMap.get(`${WaterfallLegendType.Type}:${item.type ?? ''}`) ?? '',
      }));

      const errorMarks =
        rootItem && errors
          ? getWaterfallErrorsMarks({
              errors,
              traceItems: traceWaterfall,
              rootItem,
              onErrorClick,
            })
          : [];

      return {
        rootItem,
        traceState,
        message: traceState !== TraceDataState.Full ? FALLBACK_WARNING : undefined,
        traceWaterfall,
        duration: getTraceWaterfallDuration(traceWaterfall),
        maxDepth: Math.max(...traceWaterfall.map((item) => item.depth)),
        legends,
        colorBy,
        errorMarks,
      };
    } catch (e) {
      return {
        traceState: TraceDataState.Invalid,
        message: INSTRUMENTATION_WARNING,
        traceWaterfall: [],
        legends: [],
        duration: 0,
        maxDepth: 0,
        colorBy: WaterfallLegendType.Type,
        errorMarks: [],
      };
    }
  }, [traceItems, isFiltered, errors, onErrorClick, entryTransactionId]);

  return waterfall;
}

function getWaterfallErrorsMarks({
  errors,
  traceItems,
  rootItem,
  onErrorClick,
}: {
  errors: Error[];
  traceItems: TraceWaterfallItem[];
  rootItem: TraceItem;
  onErrorClick?: OnErrorClick;
}): ErrorMark[] {
  const rootTimestampUs = rootItem.timestampUs;
  const traceItemsByIdMap = new Map(traceItems.map((item) => [item.id, item]));
  return errors.map((error) => {
    const parent = error.parent?.id ? traceItemsByIdMap.get(error.parent?.id) : undefined;
    const docId = error.transaction?.id || error.span?.id;
    return {
      type: 'errorMark',
      error,
      id: error.id,
      verticalLine: false,
      offset: getTimestampUs(error) - rootTimestampUs,
      skew: getClockSkew({ itemTimestamp: getTimestampUs(error), itemDuration: 0, parent }),
      serviceColor: parent?.color ?? '',
      onClick:
        onErrorClick && docId
          ? () => {
              onErrorClick({
                traceId: rootItem.traceId,
                docId,
                errorCount: 1,
                errorDocId: error.id,
                docIndex: error.index,
              });
            }
          : undefined,
    };
  });
}

export function getColorByType(legends: IWaterfallLegend[]) {
  let serviceCount = 0;
  let hasEmptyType = false;

  for (const legend of legends) {
    if (legend.type === WaterfallLegendType.ServiceName) serviceCount++;
    if (legend.type === WaterfallLegendType.Type && !legend.value) hasEmptyType = true;
  }

  if (serviceCount > 1 || hasEmptyType) return WaterfallLegendType.ServiceName;

  return WaterfallLegendType.Type;
}

export function getLegends(traceItems: TraceItem[]): IWaterfallLegend[] {
  const serviceNames = Array.from(new Set(traceItems.map((item) => item.serviceName)));
  const types = Array.from(new Set(traceItems.map((item) => item.type ?? '')));

  const palette = euiPaletteColorBlind({
    rotations: Math.ceil((serviceNames.length + types.length) / 10),
  });

  let colorIndex = 0;
  const legends: IWaterfallLegend[] = [];

  serviceNames.forEach((serviceName) => {
    legends.push({
      type: WaterfallLegendType.ServiceName,
      value: serviceName,
      color: palette[colorIndex++],
    });
  });

  types.forEach((type) => {
    legends.push({
      type: WaterfallLegendType.Type,
      value: type,
      color: palette[colorIndex++],
    });
  });
  return legends;
}

export function createColorLookupMap(legends: IWaterfallLegend[]): Map<string, string> {
  return new Map(legends.map((legend) => [`${legend.type}:${legend.value}`, legend.color]));
}

export function getTraceParentChildrenMap(traceItems: TraceItem[], filteredTrace: boolean) {
  if (traceItems.length === 0) {
    return {};
  }

  const traceMap = traceItems.reduce<Record<string, TraceItem[]>>((acc, item) => {
    if (item.parentId) {
      (acc[item.parentId] ??= []).push(item);
    } else {
      (acc.root ??= [])[0] = item;
    }
    return acc;
  }, {});

  // TODO: Electing a fallback root item could be delegated to the server. For now
  // As mapping parent->children spans is done clientside, the root election is done
  // clientside as well.
  if (filteredTrace && !traceMap.root) {
    const root = traceItems
      .slice(1)
      .reduce(
        (acc, span) =>
          acc.timestampUs <= span.timestampUs || acc.id === span.parentId ? acc : span,
        traceItems[0]
      );

    traceMap.root = [root];
  }

  return traceMap;
}

export enum TraceDataState {
  Full = 'full',
  Partial = 'partial',
  Empty = 'empty',
  Invalid = 'invalid',
}

export function getRootItemOrFallback(
  traceParentChildrenMap: Record<string, TraceItem[]>,
  traceItems: TraceItem[],
  entryTransactionId?: string
) {
  if (traceItems.length === 0) {
    return {
      traceState: TraceDataState.Empty,
    };
  }

  const entryTransactionRootItem = entryTransactionId
    ? traceItems?.find((item) => item.id === entryTransactionId)
    : undefined;

  const rootItem = entryTransactionRootItem
    ? entryTransactionRootItem
    : traceParentChildrenMap.root?.[0];

  const parentIds = new Set(traceItems.map(({ id }) => id));
  // TODO: Reuse waterfall util methods where possible or if logic is the same
  const orphans = traceItems.filter(
    (item) =>
      // Root cannot be an orphan.
      item.id !== rootItem?.id && item.parentId && !parentIds.has(item.parentId)
  );

  if (rootItem) {
    return {
      traceState: orphans.length === 0 ? TraceDataState.Full : TraceDataState.Partial,
      rootItem,
      orphans,
    };
  }

  const [fallbackRootItem, ...remainingOrphans] = orphans;

  return {
    traceState: TraceDataState.Partial,
    rootItem: fallbackRootItem,
    orphans: remainingOrphans,
  };
}

// TODO: Reuse waterfall util methods where possible or if logic is the same
function reparentOrphansToRoot(
  rootItem: TraceItem,
  parentChildMap: Record<string, TraceItem[]>,
  orphans: TraceItem[]
) {
  // Some cases with orphans, the root item has no direct link or children, so this
  // might be not initialised. This assigns the array in case of undefined/null to the
  // map.
  const children = (parentChildMap[rootItem.id] ??= []);

  children.push(
    ...orphans
      .filter((orphan) => {
        // A partial trace can choose a descendant transaction as the visible root.
        // Reparenting an orphan ancestor below that root would create a cycle in
        // the waterfall traversal.
        return !hasPathToTarget(parentChildMap, orphan.id, rootItem.id);
      })
      .map((orphan) => ({ ...orphan, parentId: rootItem.id, isOrphan: true }))
  );
}

function hasPathToTarget(
  parentChildMap: Record<string, TraceItem[]>,
  startId: string,
  targetId: string
) {
  const stack = (parentChildMap[startId] ?? []).map(({ id }) => id);
  const visited = new Set<string>();

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }

    if (currentId === targetId) {
      return true;
    }

    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);

    for (const child of parentChildMap[currentId] ?? []) {
      stack.push(child.id);
    }
  }

  return false;
}

type RawTraceWaterfallItem = Omit<TraceWaterfallItem, 'color'>;

interface TraversalFrame {
  item: TraceItem;
  depth: number;
  parent?: RawTraceWaterfallItem;
}

export function getTraceWaterfall({
  rootItem,
  parentChildMap,
  orphans,
}: {
  rootItem: TraceItem;
  parentChildMap: Record<string, TraceItem[]>;
  orphans: TraceItem[];
}): RawTraceWaterfallItem[] {
  const rootStartMicroseconds = rootItem.timestampUs;

  const visitor = new Set<string>([rootItem.id]);

  reparentOrphansToRoot(rootItem, parentChildMap, orphans);

  const flattenedTraceWaterfall: RawTraceWaterfallItem[] = [];
  const stack: TraversalFrame[] = [{ item: rootItem, depth: 0 }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }

    const { item, depth, parent } = frame;
    const startMicroseconds = item.timestampUs;
    const traceWaterfallItem: RawTraceWaterfallItem = {
      ...item,
      depth,
      offset: startMicroseconds - rootStartMicroseconds,
      skew: getClockSkew({ itemTimestamp: startMicroseconds, itemDuration: item.duration, parent }),
    };

    flattenedTraceWaterfall.push(traceWaterfallItem);

    const sortedChildren =
      parentChildMap[item.id]?.sort((a, b) => a.timestampUs - b.timestampUs) ?? [];

    // Push children in reverse so pop order matches recursive ascending traversal.
    for (let i = sortedChildren.length - 1; i >= 0; i--) {
      const child = sortedChildren[i];

      // Check if we have encountered the trace item before.
      // If we have visited the trace item before, then the child waterfall items are already
      // present in the flattened list, so we throw an error to alert the user of duplicated
      // spans. This should guard against circular or unusual links between spans.
      if (visitor.has(child.id)) {
        throw new Error('Duplicate span id detected');
      }

      // If we haven't visited it before, then we can process the waterfall item.
      visitor.add(child.id);
      stack.push({ item: child, depth: depth + 1, parent: traceWaterfallItem });
    }
  }

  return flattenedTraceWaterfall;
}

export function getClockSkew({
  itemTimestamp,
  itemDuration,
  parent,
}: {
  itemTimestamp: number;
  itemDuration: number;
  parent?: RawTraceWaterfallItem;
}) {
  let skew = 0;
  if (parent) {
    const parentTimestamp = parent.timestampUs;
    const parentStart = parentTimestamp + parent.skew;

    const offsetStart = parentStart - itemTimestamp;
    if (offsetStart > 0) {
      const latency = Math.max(parent.duration - itemDuration, 0) / 2;
      skew = offsetStart + latency;
    }
  }
  return skew;
}

export function getTraceWaterfallDuration(flattenedTraceWaterfall: TraceWaterfallItem[]) {
  return Math.max(
    ...flattenedTraceWaterfall.map((item) => item.offset + item.skew + item.duration),
    0
  );
}

export function getSubtreeIds(
  parentChildMap: Record<string, TraceItem[]>,
  rootId: string
): string[] {
  const ids: string[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    ids.push(current);
    for (const child of parentChildMap[current] ?? []) {
      stack.push(child.id);
    }
  }
  return ids;
}

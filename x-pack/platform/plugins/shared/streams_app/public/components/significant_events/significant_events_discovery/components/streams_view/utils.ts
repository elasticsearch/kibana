/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Direction } from '@elastic/eui';
import { Ast, Query } from '@elastic/eui';
import type { QualityIndicators } from '@kbn/dataset-quality-plugin/common/types';
import type { ListStreamDetail } from '@kbn/streams-plugin/server/routes/internal/streams/crud/route';
import {
  getAncestors,
  getSegments,
  isDescendantOf,
  isDslLifecycle,
  isIlmLifecycle,
  isRootStreamDefinition,
  Streams,
} from '@kbn/streams-schema';
import { parseDurationInSeconds } from '../../../../../util/parse_duration';

const SORTABLE_FIELDS = ['nameSortKey'] as const;

export type SortableField = (typeof SORTABLE_FIELDS)[number];

export interface EnrichedStream extends ListStreamDetail {
  nameSortKey: string;
  documentsCount: number;
  retentionMs: number;
  type: 'wired' | 'root' | 'classic' | 'query';
  children?: EnrichedStream[];
}

export type TableRow = EnrichedStream & {
  level: number;
  rootNameSortKey: string;
  rootDocumentsCount: number;
  rootRetentionMs: number;
  dataQuality: QualityIndicators;
};
export interface StreamTree extends ListStreamDetail {
  children: StreamTree[];
}

export function shouldComposeTree(sortField: SortableField) {
  // Always allow tree mode for nameSortKey
  return !sortField || sortField === 'nameSortKey';
}

// Builds an EUI Query from the free-text search bar input. The search bar runs in
// `text` mode and accepts arbitrary input, but `Query.parse` only understands EUI
// query syntax and throws on characters such as a leading comma. When parsing fails
// we keep the raw input as a plain-text filter with no clauses, so the table still
// filters by name instead of the page crashing.
export function parseSearchQuery(searchText: string): Query {
  try {
    return Query.parse(searchText);
  } catch {
    return new Query(Ast.create([]), undefined, searchText);
  }
}

// Returns all streams that match the query or are ancestors of a match
export function filterStreamsByQuery(
  streams: ListStreamDetail[],
  query: string
): ListStreamDetail[] {
  if (!query) return streams;
  const lowerQuery = query.toLowerCase();
  const nameToStream = new Map<string, ListStreamDetail>();
  streams.forEach((s) => nameToStream.set(s.stream.name, s));

  // Find all streams that match the query
  const matching = streams.filter((s) => s.stream.name.toLowerCase().includes(lowerQuery));
  const resultSet = new Map<string, ListStreamDetail>();
  for (const stream of matching) {
    // Add the match
    resultSet.set(stream.stream.name, stream);
    // Add all ancestors
    const ancestors = getAncestors(stream.stream.name);
    for (let i = 0; i < ancestors.length; ++i) {
      const ancestor = nameToStream.get(ancestors[i]);
      if (ancestor) {
        resultSet.set(ancestors[i], ancestor);
      }
    }
  }
  return Array.from(resultSet.values());
}

// Filters out rows that are children of collapsed streams
export function filterCollapsedStreamRows(
  rows: TableRow[],
  collapsedStreams: Set<string>,
  sortField: SortableField
) {
  if (!shouldComposeTree(sortField)) return rows;
  const result: TableRow[] = [];
  for (const row of rows) {
    // If any ancestor is collapsed, skip this row
    const ancestors = getAncestors(row.stream.name);
    let skip = false;
    for (let i = 0; i < ancestors.length; ++i) {
      if (collapsedStreams.has(ancestors[i])) {
        skip = true;
        break;
      }
    }
    if (!skip) result.push(row);
  }
  return result;
}

export function buildStreamRows(
  enrichedStreams: EnrichedStream[],
  sortField: SortableField,
  sortDirection: Direction,
  qualityByStream: Record<string, QualityIndicators>
): TableRow[] {
  const isAscending = sortDirection === 'asc';
  const compare = (a: EnrichedStream, b: EnrichedStream): number => {
    const av = a[sortField];
    const bv = b[sortField];
    if (typeof av === 'string' && typeof bv === 'string') {
      return isAscending ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    if (typeof av === 'number' && typeof bv === 'number') {
      return isAscending ? av - bv : bv - av;
    }
    return 0;
  };

  const result: TableRow[] = [];
  const pushNode = (
    node: EnrichedStream,
    level: number,
    rootMeta: Pick<TableRow, 'rootNameSortKey' | 'rootDocumentsCount' | 'rootRetentionMs'>
  ) => {
    result.push({
      ...node,
      level,
      ...rootMeta,
      dataQuality: qualityByStream[node.stream.name] ?? 'good',
    });
    if (node.children) {
      node.children.sort(compare).forEach((child) => pushNode(child, level + 1, rootMeta));
    }
  };

  [...enrichedStreams].sort(compare).forEach((root) => {
    const rootMeta = {
      rootNameSortKey: root.nameSortKey,
      rootDocumentsCount: root.documentsCount,
      rootRetentionMs: root.retentionMs,
    } as const;
    pushNode(root, 0, rootMeta);
  });

  return result;
}

export function asTrees(streams: ListStreamDetail[]): StreamTree[] {
  const trees: StreamTree[] = [];
  const sortedStreams = streams
    .slice()
    .sort((a, b) => getSegments(a.stream.name).length - getSegments(b.stream.name).length);

  sortedStreams.forEach((streamDetail) => {
    let currentTree = trees;
    let existingNode: StreamTree | undefined;
    while (
      (existingNode = currentTree.find((node) =>
        isDescendantOf(node.stream.name, streamDetail.stream.name)
      ))
    ) {
      currentTree = existingNode.children;
    }

    if (!existingNode) {
      currentTree.push({ ...streamDetail, children: [] });
    }
  });

  return trees;
}

export const enrichStream = (node: StreamTree | ListStreamDetail): EnrichedStream => {
  let retentionMs = 0;
  const lc = node.effective_lifecycle!;
  if (isDslLifecycle(lc)) {
    retentionMs = lc.dsl.data_retention
      ? parseDurationInSeconds(lc.dsl.data_retention) * 1000
      : Number.POSITIVE_INFINITY;
  } else if (isIlmLifecycle(lc)) {
    retentionMs = Number.POSITIVE_INFINITY;
  }
  const nameSortKey =
    'children' in node
      ? `${getSegments(node.stream.name).length}_${node.stream.name.toLowerCase()}`
      : node.stream.name;
  const children = 'children' in node ? node.children.map(enrichStream) : undefined;

  return {
    stream: node.stream,
    effective_lifecycle: node.effective_lifecycle,
    data_stream: node.data_stream,
    privileges: node.privileges,
    nameSortKey,
    documentsCount: 0,
    retentionMs,
    type: Streams.ClassicStream.Definition.is(node.stream)
      ? 'classic'
      : Streams.QueryStream.Definition.is(node.stream)
      ? 'query'
      : isRootStreamDefinition(node.stream)
      ? 'root'
      : 'wired',
    ...(children && { children }),
  };
};

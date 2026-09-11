/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Document, LineCounter } from 'yaml';
import { visit } from 'yaml';
import { getPathFromAncestors } from '@kbn/workflows/common/utils/yaml';
import type { WorkflowGraph } from '@kbn/workflows/graph';
import { matchAllVariables } from '@kbn/workflows-yaml';
import type { VariableItem } from '../model/types';

interface ScalarEntry {
  start: number;
  end: number;
  path: Array<string | number>;
}

const scalarIndexCache = new WeakMap<Document, ScalarEntry[]>();

/**
 * Builds a sorted index of every scalar in the document in a single `visit()`,
 * pre-computing both ranges and YAML paths.
 */
function getScalarIndex(document: Document): ScalarEntry[] {
  const cached = scalarIndexCache.get(document);
  if (cached) {
    return cached;
  }

  const entries: ScalarEntry[] = [];
  visit(document, {
    Scalar(_k, node, ancestors) {
      if (node.range && node.value !== '') {
        entries.push({
          start: node.range[0],
          end: node.range[1],
          path: getPathFromAncestors(ancestors, node),
        });
      }
    },
  });

  entries.sort((a, b) => a.start - b.start);
  scalarIndexCache.set(document, entries);
  return entries;
}

function findScalarAtOffset(entries: ScalarEntry[], offset: number): ScalarEntry | null {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const entry = entries[mid];
    if (offset < entry.start) {
      hi = mid - 1;
    } else if (offset >= entry.end) {
      lo = mid + 1;
    } else {
      return entry;
    }
  }
  return null;
}

export function collectAllVariables(
  yamlString: string,
  yamlDocument: Document,
  lineCounter: LineCounter,
  workflowGraph: WorkflowGraph
): VariableItem[] {
  const scalarIndex = getScalarIndex(yamlDocument);
  const variableItems: VariableItem[] = [];

  for (const match of matchAllVariables(yamlString)) {
    const startOffset = match.index ?? 0;
    const entry = findScalarAtOffset(scalarIndex, startOffset);
    if (entry) {
      const endOffset = startOffset + (match[0].length ?? 0);
      const startPosition = lineCounter.linePos(startOffset);
      const endPosition = lineCounter.linePos(endOffset);
      const { path: yamlPath } = entry;
      const type =
        yamlPath.length > 1 && yamlPath[yamlPath.length - 1] === 'foreach' ? 'foreach' : 'regexp';
      variableItems.push({
        id: `${match.groups.key}-${startPosition.line}-${startPosition.col}-${endPosition.line}-${endPosition.col}`,
        startLineNumber: startPosition.line,
        startColumn: startPosition.col,
        endLineNumber: endPosition.line,
        endColumn: endPosition.col,
        key: match.groups.key,
        type,
        yamlPath,
        offset: startOffset,
      });
    }
  }

  return variableItems;
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { type Document, isPair, isScalar, type LineCounter, visit } from 'yaml';
import { WAIT_FOR_APPROVAL_CHANNEL_CONNECTOR_TYPES } from '@kbn/workflows';
import { getPathFromAncestors } from '../../../../common/lib/yaml';
import type { ConnectorIdItem } from '../model/types';

function isConnectorIdValue(node: unknown, lastAncestor: unknown): boolean {
  return isPair(lastAncestor) && lastAncestor.value === node;
}

function findConnectorTypeFromStepAncestor(ancestors: readonly unknown[]): string | undefined {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];
    if (ancestor && typeof ancestor === 'object' && 'items' in ancestor) {
      const items = (ancestor as { items?: unknown[] }).items;
      if (Array.isArray(items)) {
        let hasType = false;
        let hasConnectorId = false;
        let typeValue: unknown;

        for (const item of items) {
          if (isPair(item) && isScalar(item.key)) {
            if (item.key.value === 'type' && isScalar(item.value)) {
              hasType = true;
              typeValue = item.value.value;
            } else if (item.key.value === 'connector-id') {
              hasConnectorId = true;
            }
          }
        }

        if (hasType && hasConnectorId && typeof typeValue === 'string') {
          return typeValue;
        }
      }
    }
  }

  return undefined;
}

function findConnectorTypeFromChannelsPath(path: readonly unknown[]): string | undefined {
  const channelsIdx = path.indexOf('channels');
  if (
    channelsIdx < 0 ||
    path[channelsIdx + 2] !== 'connector-id' ||
    typeof path[channelsIdx + 1] !== 'string'
  ) {
    return undefined;
  }

  const channelKey = path[
    channelsIdx + 1
  ] as keyof typeof WAIT_FOR_APPROVAL_CHANNEL_CONNECTOR_TYPES;
  return WAIT_FOR_APPROVAL_CHANNEL_CONNECTOR_TYPES[channelKey];
}

export function collectAllConnectorIds(
  yamlDocument: Document,
  lineCounter: LineCounter | undefined
): ConnectorIdItem[] {
  const connectorIdItems: ConnectorIdItem[] = [];

  if (!yamlDocument?.contents || !lineCounter) {
    return connectorIdItems;
  }

  visit(yamlDocument, {
    Scalar(key, node, ancestors) {
      if (!node.range) {
        return;
      }

      const lastAncestor = ancestors?.[ancestors.length - 1];
      const isConnectorIdProp =
        isPair(lastAncestor) &&
        isScalar(lastAncestor.key) &&
        lastAncestor.key.value === 'connector-id';

      if (!isConnectorIdProp || !node.value || !isConnectorIdValue(node, lastAncestor)) {
        return;
      }

      const path = getPathFromAncestors(ancestors);
      const connectorType =
        findConnectorTypeFromStepAncestor(ancestors ?? []) ??
        findConnectorTypeFromChannelsPath(path) ??
        'unknown';

      const [startOffset, endOffset] = node.range;
      const startPos = lineCounter.linePos(startOffset);
      const endPos = lineCounter.linePos(endOffset);

      connectorIdItems.push({
        id: `${node.value}-${startPos.line}-${startPos.col}-${endPos.line}-${endPos.col}`,
        connectorType,
        type: 'connector-id',
        key: node.value as string,
        startLineNumber: startPos.line,
        startColumn: startPos.col,
        endLineNumber: endPos.line,
        endColumn: endPos.col,
        yamlPath: path,
      });
    },
  });

  return connectorIdItems;
}

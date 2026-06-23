/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PanelFailure } from '../utils';
import type { DashboardOperation } from './registry';
import {
  PANEL_TYPE_DEFINITIONS,
  type AddPanelsItemInput,
  type NewPanelInput,
  type PanelContent,
  type PanelRequestInput,
  type ResolvePanelContent,
} from './panels';

type ResolvedPanelContent = Awaited<ReturnType<ResolvePanelContent>>;

export type PanelCreationRequest =
  | {
      operationType: 'add_section';
      panelInput: PanelRequestInput;
      panelInputIndex: number;
    }
  | {
      operationType: 'add_panels';
      panelInput: Extract<AddPanelsItemInput, { source: 'request' }>;
      panelInputIndex: number;
      sectionId?: string;
    };

export interface ResolvedPanelCreationRequest {
  request: PanelCreationRequest;
  resolvedPanel: ResolvedPanelContent;
}

/**
 * Collect inline panel creation work, keyed by operation index, so it can be
 * resolved up front in parallel and applied later in operation order.
 */
const collectPanelCreationRequests = (
  operations: DashboardOperation[]
): Map<number, PanelCreationRequest[]> => {
  const requestsByOperationIndex = new Map<number, PanelCreationRequest[]>();

  for (const [operationIndex, operation] of operations.entries()) {
    switch (operation.operation) {
      case 'add_section': {
        if (!operation.panels) {
          break;
        }

        const panelRequests = operation.panels.flatMap((panelInput, panelInputIndex) =>
          panelInput.source === 'request'
            ? [
                {
                  operationType: operation.operation,
                  panelInput,
                  panelInputIndex,
                },
              ]
            : []
        );

        if (panelRequests.length > 0) {
          requestsByOperationIndex.set(operationIndex, panelRequests);
        }
        break;
      }
      case 'add_panels': {
        const panelRequests = operation.panels.flatMap((panelInput, panelInputIndex) =>
          panelInput.source === 'request'
            ? [
                {
                  operationType: operation.operation,
                  panelInput,
                  panelInputIndex,
                  sectionId: panelInput.sectionId,
                },
              ]
            : []
        );

        if (panelRequests.length > 0) {
          requestsByOperationIndex.set(operationIndex, panelRequests);
        }
        break;
      }
      default:
        break;
    }
  }

  return requestsByOperationIndex;
};

/**
 * Resolve all collected inline panel creation requests up front while keeping
 * results grouped by their source operation for ordered application later.
 */
export const resolvePanelCreationRequests = async ({
  operations,
  resolvePanelContent,
}: {
  operations: DashboardOperation[];
  resolvePanelContent?: ResolvePanelContent;
}): Promise<Map<number, ResolvedPanelCreationRequest[]>> => {
  const requestsByOperationIndex = collectPanelCreationRequests(operations);

  if (requestsByOperationIndex.size === 0) {
    return new Map();
  }

  if (!resolvePanelContent) {
    throw new Error('Inline panel resolver is required for panel creation operations.');
  }

  const resolvedRequestsByOperationIndex = await Promise.all(
    Array.from(requestsByOperationIndex.entries()).map(
      async ([operationIndex, requests]): Promise<
        readonly [number, ResolvedPanelCreationRequest[]]
      > =>
        [
          operationIndex,
          await Promise.all(
            requests.map(async (request) => ({
              request,
              resolvedPanel: await resolvePanelContent({
                type: request.panelInput.type,
                operationType: request.operationType,
                identifier: request.panelInput.query,
                nlQuery: request.panelInput.query,
                index: request.panelInput.index,
                chartType: request.panelInput.chartType,
                esql: request.panelInput.esql,
              }),
            }))
          ),
        ] as const
    )
  );

  return new Map(resolvedRequestsByOperationIndex);
};

/**
 * Return the resolved create results for one operation during the apply phase.
 * Returns an empty array for operations with no panel requests.
 */
const getResolvedPanelCreationRequests = ({
  resolvedRequestsByOperationIndex,
  operationIndex,
}: {
  resolvedRequestsByOperationIndex: Map<number, ResolvedPanelCreationRequest[]>;
  operationIndex: number;
}): ResolvedPanelCreationRequest[] => resolvedRequestsByOperationIndex.get(operationIndex) ?? [];

/**
 * Turns a new-panel input into panel content so operation handlers don't branch
 * on `source`:
 * - `source: 'config'`: built by value from the panel type's registry definition.
 * - `source: 'request'`: read from the up-front parallel resolution (keyed by
 *   panel input index).
 *
 * Returns `undefined` and records a failure when a panel request didn't resolve.
 */
export const createPanelInputMaterializer = ({
  resolvedPanelCreationRequests,
  operationIndex,
  operationType,
  failures,
}: {
  resolvedPanelCreationRequests: Map<number, ResolvedPanelCreationRequest[]>;
  operationIndex: number;
  operationType: DashboardOperation['operation'];
  failures: PanelFailure[];
}): ((item: NewPanelInput, panelInputIndex: number) => PanelContent | undefined) => {
  const resolvedRequestByInputIndex = new Map(
    getResolvedPanelCreationRequests({
      resolvedRequestsByOperationIndex: resolvedPanelCreationRequests,
      operationIndex,
    }).map((resolvedRequest) => [resolvedRequest.request.panelInputIndex, resolvedRequest])
  );

  return (item, panelInputIndex) => {
    if (item.source === 'config') {
      return PANEL_TYPE_DEFINITIONS[item.type].buildPanelContent(item.config);
    }

    const resolvedRequest = resolvedRequestByInputIndex.get(panelInputIndex);
    if (!resolvedRequest) {
      throw new Error(
        `Missing pre-resolved panel request for ${operationType} operation at index ${operationIndex}, panel input index ${panelInputIndex}.`
      );
    }

    if (resolvedRequest.resolvedPanel.type === 'failure') {
      failures.push(resolvedRequest.resolvedPanel.failure);
      return undefined;
    }

    return resolvedRequest.resolvedPanel.panelContent;
  };
};

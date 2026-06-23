/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import { z } from '@kbn/zod/v4';
import { addPanelsOperation } from './add_panels';
import { addSectionOperation } from './add_section';
import { editPanelsOperation } from './edit_panels';
import { removePanelsOperation } from './remove_panels';
import { removeSectionOperation } from './remove_section';
import { setMetadataOperation } from './set_metadata';
import type { OperationExecutionContext } from './types';
import { updatePanelLayoutsOperation } from './update_panel_layouts';
import { resolvePanelCreationRequests } from './panel_creation';

const operationDefinitions = [
  setMetadataOperation,
  addPanelsOperation,
  editPanelsOperation,
  updatePanelLayoutsOperation,
  addSectionOperation,
  removeSectionOperation,
  removePanelsOperation,
] as const;

const schemas = operationDefinitions.map((definition) => definition.schema);

export const dashboardOperationSchema = z.discriminatedUnion(
  'operation',
  schemas as unknown as [(typeof schemas)[number], ...(typeof schemas)[number][]]
);

export type DashboardOperation = z.infer<typeof dashboardOperationSchema>;

const operationDefinitionByType = new Map(
  operationDefinitions.map((definition) => [definition.schema.shape.operation.value, definition])
);

interface PrepareOperationExecutionParams {
  operations: DashboardOperation[];
  logger: OperationExecutionContext['logger'];
  failures: OperationExecutionContext['failures'];
  resolvePanelContent?: OperationExecutionContext['resolvePanelContent'];
}

export const prepareOperationExecution = async ({
  operations,
  logger,
  failures,
  resolvePanelContent,
}: PrepareOperationExecutionParams): Promise<OperationExecutionContext> => {
  const resolvedPanelCreationRequests = await resolvePanelCreationRequests({
    operations,
    resolvePanelContent,
  });

  return {
    logger,
    failures,
    resolvedPanelCreationRequests,
    resolvePanelContent,
  };
};

export const executeOperationHandler = async ({
  dashboardData,
  operation,
  operationIndex,
  context,
}: {
  dashboardData: DashboardAttachmentData;
  operation: DashboardOperation;
  operationIndex: number;
  context: OperationExecutionContext;
}): Promise<DashboardAttachmentData> => {
  const definition = operationDefinitionByType.get(operation.operation);
  if (!definition) {
    throw new Error(`No handler for ${operation.operation}`);
  }

  return definition.handler({ dashboardData, operation, operationIndex, context });
};

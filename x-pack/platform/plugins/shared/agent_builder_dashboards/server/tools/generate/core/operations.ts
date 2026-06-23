/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardAttachmentData } from '@kbn/agent-builder-dashboards-common';
import type { Logger } from '@kbn/core/server';
import type { ResolvePanelContent } from './operations/panels';
import type { PanelFailure } from './utils';
import {
  dashboardOperationSchema,
  executeOperationHandler,
  prepareOperationExecution,
  type DashboardOperation,
} from './operations/registry';

export { dashboardOperationSchema };
export type { DashboardOperation };

interface ExecuteDashboardOperationsParams {
  dashboardData?: DashboardAttachmentData;
  operations: DashboardOperation[];
  logger: Logger;
  resolvePanelContent?: ResolvePanelContent;
}

/**
 * Environment-agnostic dashboard generation: turns a prior dashboard payload (or
 * an empty one) plus an ordered list of operations into a new payload. Identity,
 * persistence, and result shape belong to the calling tool. Inline panel content
 * is resolved via the injected `resolvePanelContent` callback, so the core never
 * reads any store.
 */
export const executeDashboardOperations = async ({
  dashboardData,
  operations,
  logger,
  resolvePanelContent,
}: ExecuteDashboardOperationsParams): Promise<{
  dashboardData: DashboardAttachmentData;
  failures: PanelFailure[];
}> => {
  let nextDashboardData = structuredClone(
    dashboardData ?? {
      title: 'User Dashboard',
      description: undefined,
      panels: [],
    }
  );
  const failures: PanelFailure[] = [];

  const context = await prepareOperationExecution({
    operations,
    logger,
    resolvePanelContent,
    failures,
  });

  for (const [operationIndex, operation] of operations.entries()) {
    nextDashboardData = await executeOperationHandler({
      dashboardData: nextDashboardData,
      operation,
      operationIndex,
      context,
    });
  }

  return {
    dashboardData: nextDashboardData,
    failures,
  };
};

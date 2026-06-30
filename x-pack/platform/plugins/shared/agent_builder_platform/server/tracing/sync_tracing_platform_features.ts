/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import {
  syncAgentBuilderOverviewDashboard,
  syncAgentBuilderOverviewDashboardForSpace,
} from '../dashboard';

export async function syncTracingPlatformFeatures({
  coreStart,
  logger,
  enabled,
  spaceId,
}: {
  coreStart: Pick<CoreStart, 'savedObjects'>;
  logger: Logger;
  enabled: boolean;
  spaceId?: string;
}): Promise<void> {
  if (spaceId) {
    await syncAgentBuilderOverviewDashboardForSpace(coreStart, enabled, spaceId, logger);
    return;
  }

  await syncAgentBuilderOverviewDashboard(coreStart, enabled, logger);
}

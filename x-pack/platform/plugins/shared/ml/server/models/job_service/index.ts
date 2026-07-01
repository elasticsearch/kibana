/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IScopedClusterClient } from '@kbn/core/server';
import type { RulesClient } from '@kbn/alerting-plugin/server';
import { datafeedsProvider } from './datafeeds';
import { jobsProvider } from './jobs';
import { groupsProvider } from './groups';
import { newJobCapsProvider } from './new_job_caps';
import { newJobChartsProvider, topCategoriesProvider } from './new_job';
import { modelSnapshotProvider } from './model_snapshots';
import type { MlClient } from '../../lib/ml_client';
import type { ServerlessInfo } from '../../types';

export function jobServiceProvider(
  client: IScopedClusterClient,
  mlClient: MlClient,
  serverless: ServerlessInfo,
  rulesClient?: RulesClient
) {
  return {
    ...datafeedsProvider(client, mlClient),
    ...jobsProvider(client, mlClient, serverless, rulesClient),
    ...groupsProvider(mlClient),
    ...newJobCapsProvider(client),
    ...newJobChartsProvider(client),
    ...topCategoriesProvider(mlClient),
    ...modelSnapshotProvider(client, mlClient),
  };
}

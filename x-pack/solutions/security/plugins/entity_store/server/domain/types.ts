/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type {
  EngineDescriptor,
  LogExtractionConfig,
  HistorySnapshotState,
  EntityStorePreferences,
} from './saved_objects';
import type { EntityStoreStatus } from '../../common';
import type { ENTITY_STORE_STATUS } from './constants';

export type { EntityStoreStatus };

export const EngineComponentResource = z.enum([
  'entity_definition',
  'index_template',
  'task',
  'index',
  'ilm_policy',
  'component_template',
]);
export type EngineComponentResource = z.infer<typeof EngineComponentResource>;

export type BaseComponentStatus = z.infer<typeof BaseComponentStatus>;
export const BaseComponentStatus = z.object({
  id: z.string(),
  installed: z.boolean(),
  resource: EngineComponentResource,
});

export type TaskComponentStatus = z.infer<typeof TaskComponentStatus>;
export const TaskComponentStatus = BaseComponentStatus.merge(
  z.object({
    status: z.string(),
    remainingLogsToExtract: z.number().nullable(),
    runs: z.number(),
    lastError: z.string(),
  })
);

export type EngineComponentStatus = BaseComponentStatus | TaskComponentStatus;

export interface GetStatusSuccessResult {
  status: EntityStoreStatus;
  engines: Array<EngineDescriptor | (EngineDescriptor & { components: EngineComponentStatus[] })>;
  historySnapshot: HistorySnapshotState;
  logsExtractionConfig: LogExtractionConfig;
  preferences: Pick<EntityStorePreferences, 'autoInstall'>;
}

export interface GetStatusNotInstalledResult {
  status: typeof ENTITY_STORE_STATUS.NOT_INSTALLED;
  // Should be empty array, but we keep it for simplicity
  engines: GetStatusSuccessResult['engines'][number][];
  preferences: Pick<EntityStorePreferences, 'autoInstall'>;
}

export type GetStatusResult = GetStatusSuccessResult | GetStatusNotInstalledResult;

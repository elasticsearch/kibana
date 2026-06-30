/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, SavedObjectsClientContract } from '@kbn/core/server';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import type { ModuleJob } from '@kbn/ml-common-types/modules';
import {
  ML_GROUP_IDS,
  type LEGACY_ML_GROUP_ID,
  type ML_GROUP_ID,
} from '../../../../common/constants';

const isSecurityJob = (job: ModuleJob): boolean =>
  job.config?.groups?.some((group) =>
    ML_GROUP_IDS.includes(group as typeof ML_GROUP_ID | typeof LEGACY_ML_GROUP_ID)
  ) || false;

interface GetSecurityMlJobIdsOpts {
  ml: MlPluginSetup;
  request: KibanaRequest;
  soClient: SavedObjectsClientContract;
}

export const getSecurityMlJobIds = async ({
  ml,
  request,
  soClient,
}: GetSecurityMlJobIdsOpts): Promise<string[]> => {
  const mlModulesProvider = ml.modulesProvider(request, soClient);
  const modules = await mlModulesProvider?.listModules?.();

  return (modules ?? []).flatMap((module) =>
    module.jobs.filter(isSecurityJob).map((job) => job.id)
  );
};

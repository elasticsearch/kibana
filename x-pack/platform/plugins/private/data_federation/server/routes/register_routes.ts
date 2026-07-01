/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';

import { registerDeleteDataSet } from './data_sets/delete_dataset';
import { registerCreateDataset } from './data_sets/create_dataset';
import { registerGetDataset } from './data_sets/get_dataset';
import { registerGetAllDatasets } from './data_sets/get_all_datasets';
import { registerDeleteDataSource } from './data_sources/delete_data_source';
import { registerGetDataSourceRoute } from './data_sources/get_data_source';
import { registerGetAllDataSources } from './data_sources/get_all_data_sources';
import { registerCreateDataSource } from './data_sources/create_data_source';
import type { DataFederationConfigType } from '../config';

export function registerDataSetsRoutes(router: IRouter, config: DataFederationConfigType): void {
  registerGetAllDataSources(router);
  registerGetDataSourceRoute(router);
  registerCreateDataSource(router, config);
  registerDeleteDataSource(router);
  registerGetAllDatasets(router);
  registerGetDataset(router);
  registerCreateDataset(router);
  registerDeleteDataSet(router);
}

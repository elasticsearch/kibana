/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defaultInferenceEndpoints } from '@kbn/inference-common';

export const SAMPLE_DATA_INGEST_PLUGIN_ID = 'sampleDataIngest';

/**
 * The id of the inference endpoint we're creating for our product doc indices.
 */
export const internalElserInferenceId = defaultInferenceEndpoints.ELSER;
export const indexNamePrefix = 'kibana_sample_data_';
export const MINIMUM_LICENSE_TYPE = 'enterprise';

export {
  InstallationStatus,
  type StatusResponse,
  type InstallingResponse,
  type InstalledResponse,
  DatasetSampleType,
} from './types';
export { STATUS_API_PATH, INSTALL_API_PATH, UNINSTALL_API_PATH } from './routes';
export { getSampleDataIndexName } from './utils';

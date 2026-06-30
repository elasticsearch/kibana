/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  BANK_OF_ANTHOS_GCS_BASE_PATH_PREFIX,
  BANK_OF_ANTHOS_NAMESPACE,
  GCS_BUCKET,
} from '../../constants';
import type { DatasetConfig } from '../types';
import { kiFeatureExtraction, kiFeatureDeduplication, kiFeatureExclusion } from './ki_features';
import { kiQueryGeneration } from './ki_queries';
import { discoveryInvestigator, discoveryJudge } from './discovery';

export const bankOfAnthosDataset: DatasetConfig = {
  id: BANK_OF_ANTHOS_NAMESPACE,
  description: 'Bank of Anthos sample banking microservices application',
  gcs: { bucket: GCS_BUCKET, basePathPrefix: BANK_OF_ANTHOS_GCS_BASE_PATH_PREFIX },
  kiFeatureExtraction,
  kiFeatureDeduplication,
  kiFeatureExclusion,
  discoveryInvestigator,
  discoveryJudge,
  kiQueryGeneration,
};

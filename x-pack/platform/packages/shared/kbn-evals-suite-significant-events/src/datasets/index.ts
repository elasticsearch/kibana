/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GcsConfig } from '../data_generators/replay';
import {
  BANK_OF_ANTHOS_NAMESPACE,
  OTEL_DEMO_NAMESPACE,
  QUARKUS_SUPER_HEROES_NAMESPACE,
} from '../constants';
import { bankOfAnthosDataset } from './bank_of_anthos';
import { otelDemoDataset } from './otel_demo';
import { quarkusSuperHeroesDataset } from './quarkus_super_heroes';
import type { DatasetConfig, SnapshotSourceOverride } from './types';

export const MANAGED_STREAM_NAME = 'logs';
export const MANAGED_STREAM_SEARCH_PATTERN = `${MANAGED_STREAM_NAME}*`;

const DATASETS: Record<string, DatasetConfig> = {
  [OTEL_DEMO_NAMESPACE]: otelDemoDataset,
  [BANK_OF_ANTHOS_NAMESPACE]: bankOfAnthosDataset,
  [QUARKUS_SUPER_HEROES_NAMESPACE]: quarkusSuperHeroesDataset,
};

let cachedActiveDatasets: DatasetConfig[] | undefined;

const ALL_DATASETS_SELECTOR = 'all';

const resolveRequestedDatasetIds = (selectedDatasetIds: string | undefined): string[] => {
  const allIds = Object.keys(DATASETS);
  const normalizedSelectedDatasetIds = selectedDatasetIds?.trim();

  if (!normalizedSelectedDatasetIds || normalizedSelectedDatasetIds === ALL_DATASETS_SELECTOR) {
    return allIds;
  }

  const requestedDatasets = [
    ...new Set(normalizedSelectedDatasetIds.split(',').map((id) => id.trim())),
  ].filter(Boolean);

  if (requestedDatasets.includes(ALL_DATASETS_SELECTOR)) {
    return allIds;
  }

  return requestedDatasets;
};

export const getActiveDatasets = (): DatasetConfig[] => {
  if (cachedActiveDatasets) {
    return cachedActiveDatasets;
  }

  const requestedDatasetIds = resolveRequestedDatasetIds(process.env.SIGEVENTS_DATASET);

  const unknownDatasetIds = requestedDatasetIds.filter((id) => DATASETS[id] == null);
  if (unknownDatasetIds.length > 0) {
    const available = Object.keys(DATASETS).join(', ');
    throw new Error(
      `Unknown dataset(s): ${unknownDatasetIds.join(', ')}. Available: ${available}. ` +
        `Set SIGEVENTS_DATASET to a dataset id, a comma-separated list, or "${ALL_DATASETS_SELECTOR}".`
    );
  }

  cachedActiveDatasets = requestedDatasetIds.map((id) => DATASETS[id]);
  return cachedActiveDatasets;
};

export const resolveScenarioSnapshotSource = ({
  scenarioId,
  datasetGcs,
  snapshotSource,
}: {
  scenarioId: string;
  datasetGcs: GcsConfig;
  snapshotSource?: SnapshotSourceOverride;
}): { snapshotName: string; gcs: GcsConfig } => {
  return {
    snapshotName: snapshotSource?.snapshot_name || scenarioId,
    gcs: {
      bucket: datasetGcs.bucket,
      basePathPrefix: snapshotSource?.gcs?.basePathPrefix ?? datasetGcs.basePathPrefix,
    },
  };
};

export const snapshotCatalogKey = (gcs: GcsConfig): string => `${gcs.bucket}/${gcs.basePathPrefix}`;

export const snapshotSourceKey = ({
  gcs,
  snapshotName,
}: {
  gcs: GcsConfig;
  snapshotName: string;
}): string => {
  return `${gcs.bucket}/${gcs.basePathPrefix}::${snapshotName}`;
};

export const getAllDatasetIds = (): string[] => Object.keys(DATASETS);

export const getDatasetById = (id: string): DatasetConfig | undefined => DATASETS[id];

export type {
  DatasetConfig,
  KIQueryGenerationScenario,
  KIFeatureExtractionScenario,
  KIFeatureExclusionScenario,
  KIFeatureDeduplicationScenario,
  DiscoveryInvestigatorScenario,
  DiscoveryJudgeScenario,
  SamplingCriterion,
  SnapshotSourceOverride,
} from './types';

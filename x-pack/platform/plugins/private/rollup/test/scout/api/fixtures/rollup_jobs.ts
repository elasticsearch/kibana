/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture, EsClient } from '@kbn/scout';
import { MOCK_ROLLUP_INDEX_NAME, ROLLUP_INDEX_NAME } from '../../common/fixtures/constants';
import { deleteAllRollupJobs, deleteIndicesMatching } from '../../common/fixtures/rollup_api';
import {
  API_BASE_PATH,
  INDEX_TO_ROLLUP_MAPPINGS,
  SOURCE_INDEX_PREFIX,
  TARGET_INDEX_PREFIX,
} from './constants';

/** Shape of a job as returned by `GET /api/rollup/jobs`, narrowed to what the specs assert on. */
export interface RollupJobSummary {
  config: { id: string; index_pattern: string; rollup_index: string };
  status: { job_state: string };
}

export interface RollupJobPayload {
  job: Record<string, unknown>;
}

/** Create a source index with the mappings the rollup jobs under test group and aggregate on. */
export const createSourceIndex = async (esClient: EsClient, suffix: string) => {
  const index = `${SOURCE_INDEX_PREFIX}-${suffix}`;
  await esClient.indices.create({ index, mappings: INDEX_TO_ROLLUP_MAPPINGS });
  return index;
};

/**
 * The job payload every spec creates. `interval` is deprecated in favour of `fixed_interval`, but
 * it is what the rollup UI still sends, so the tests keep exercising it (ES coerces it, which the
 * aggregations assertion in `rollup_jobs_crud.spec.ts` relies on).
 */
export const getJobPayload = (
  indexPattern: string,
  id: string,
  rollupIndex: string = ROLLUP_INDEX_NAME
): RollupJobPayload => ({
  job: {
    id,
    index_pattern: indexPattern,
    rollup_index: rollupIndex,
    cron: '0 0 0 ? * 7',
    page_size: 1000,
    groups: {
      date_histogram: {
        interval: '24h',
        delay: '1d',
        time_zone: 'UTC',
        field: 'testCreatedField',
      },
      terms: { fields: ['testTotalField', 'testTagField'] },
      histogram: { interval: '7', fields: ['testTotalField'] },
    },
    metrics: [
      { field: 'testTotalField', metrics: ['avg', 'value_count'] },
      { field: 'testCreatedField', metrics: ['max', 'min'] },
    ],
  },
});

/** Thin wrappers around the rollup routes, so the specs read as arrange/act/assert. */
export const rollupApi = (apiClient: ApiClientFixture, headers: Record<string, string>) => {
  const request = { headers, responseType: 'json' } as const;

  return {
    getIndices: () => apiClient.get(`${API_BASE_PATH}/indices`, request),
    getIndexPatternValidity: (indexPattern: string) =>
      apiClient.get(`${API_BASE_PATH}/index_pattern_validity/${indexPattern}`, request),
    loadJobs: () => apiClient.get(`${API_BASE_PATH}/jobs`, request),
    createJob: (payload: RollupJobPayload) =>
      apiClient.put(`${API_BASE_PATH}/create`, { ...request, body: payload }),
    deleteJob: (jobIds: string[]) =>
      apiClient.post(`${API_BASE_PATH}/delete`, { ...request, body: { jobIds } }),
    startJob: (jobIds: string[]) =>
      apiClient.post(`${API_BASE_PATH}/start`, { ...request, body: { jobIds } }),
    // `waitForCompletion` makes the stop synchronous, so the job state can be read back right after.
    stopJob: (jobIds: string[]) =>
      apiClient.post(`${API_BASE_PATH}/stop?waitForCompletion=true`, {
        ...request,
        body: { jobIds },
      }),
    search: (body: Array<{ index: string; query: Record<string, unknown> }>) =>
      apiClient.post(`${API_BASE_PATH}/search`, { ...request, body }),
  };
};

export type RollupApi = ReturnType<typeof rollupApi>;

/** Find a job by id in a `GET /jobs` response body. */
export const findJob = (body: { jobs: RollupJobSummary[] }, id: string) =>
  body.jobs.find((job) => job.config.id === id);

/**
 * Rollup jobs and indices are cluster-global, so every spec both arranges and tears down this
 * state: a job or rollup index left behind by an interrupted run would break the empty-list and
 * whole-response assertions. Jobs go first, since they write into the target index.
 */
export const cleanupRollupState = async (esClient: EsClient) => {
  await deleteAllRollupJobs(esClient);
  await deleteIndicesMatching(esClient, [
    `${SOURCE_INDEX_PREFIX}*`,
    `${TARGET_INDEX_PREFIX}*`,
    ROLLUP_INDEX_NAME,
    MOCK_ROLLUP_INDEX_NAME,
  ]);
};

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import { i18n } from '@kbn/i18n';
import type { IScopedClusterClient } from '@kbn/core/server';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { DatafeedStats } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed_stats';
import { JOB_STATE, DATAFEED_STATE } from '../../../common/constants/states';
import { fillResultsWithTimeouts, isRequestTimeout } from './error_utils';
import type { MlClient } from '../../lib/ml_client';

export interface MlDatafeedsResponse {
  datafeeds: Datafeed[];
  count: number;
}

export interface MlDatafeedsStatsResponse {
  datafeeds: DatafeedStats[];
  count: number;
}

export interface Results {
  [id: string]: {
    started?: estypes.MlStartDatafeedResponse['started'];
    stopped?: estypes.MlStopDatafeedResponse['stopped'];
    error?: any;
  };
}

export type DatafeedsService = ReturnType<typeof datafeedsProvider>;

export function datafeedsProvider(client: IScopedClusterClient, mlClient: MlClient) {
  async function forceStartDatafeeds(datafeedIds: string[], start?: number, end?: number) {
    const jobIds = await getJobIdsByDatafeedId();
    const doStartsCalled = datafeedIds.reduce((acc, cur) => {
      acc[cur] = false;
      return acc;
    }, {} as { [id: string]: boolean });

    const results: Results = Object.create(null);

    async function doStart(datafeedId: string): Promise<{ started: boolean; error?: string }> {
      if (doStartsCalled[datafeedId] === false) {
        doStartsCalled[datafeedId] = true;
        try {
          await startDatafeed(datafeedId, start, end);
          return { started: true };
        } catch ({ body }) {
          return { started: false, error: body };
        }
      } else {
        return { started: true };
      }
    }

    for (const datafeedId of datafeedIds) {
      const jobId = jobIds[datafeedId];
      if (jobId !== undefined) {
        try {
          if (await openJob(jobId)) {
            results[datafeedId] = await doStart(datafeedId);
          }
        } catch (error) {
          if (isRequestTimeout(error)) {
            // if the open request times out, start the datafeed anyway
            // then break out of the loop so no more requests are fired.
            // use fillResultsWithTimeouts to add a timeout error to each
            // remaining job
            results[datafeedId] = await doStart(datafeedId);
            return fillResultsWithTimeouts(results, datafeedId, datafeedIds, JOB_STATE.OPENED);
          }
          results[datafeedId] = { started: false, error: error.body };
        }
      } else {
        results[datafeedId] = {
          started: false,
          error: i18n.translate('xpack.ml.models.jobService.jobHasNoDatafeedErrorMessage', {
            defaultMessage: 'Job has no datafeed',
          }),
        };
      }
    }

    return results;
  }

  async function openJob(jobId: string) {
    let opened = false;
    try {
      const body = await mlClient.openJob({ job_id: jobId });
      opened = body.opened;
    } catch (error) {
      if (error.statusCode === 409) {
        opened = true;
      } else {
        throw error;
      }
    }
    return opened;
  }

  async function startDatafeed(datafeedId: string, start?: number, end?: number) {
    return mlClient.startDatafeed({
      datafeed_id: datafeedId,
      start: start !== undefined ? String(start) : undefined,
      end: end !== undefined ? String(end) : undefined,
    });
  }

  async function stopDatafeeds(datafeedIds: string[], closeJobs: boolean = true) {
    const results: Results = Object.create(null);

    for (const datafeedId of datafeedIds) {
      try {
        const body = await mlClient.stopDatafeed({
          datafeed_id: datafeedId,
          close_job: closeJobs,
        });
        results[datafeedId] = { stopped: body.stopped };
      } catch (error) {
        if (isRequestTimeout(error)) {
          return fillResultsWithTimeouts(results, datafeedId, datafeedIds, DATAFEED_STATE.STOPPED);
        } else {
          results[datafeedId] = {
            stopped: false,
            error: error.body,
          };
        }
      }
    }

    return results;
  }

  async function forceDeleteDatafeed(datafeedId: string) {
    const body = await mlClient.deleteDatafeed({
      datafeed_id: datafeedId,
      force: true,
    });
    return body;
  }

  async function getDatafeedIdsByJobId() {
    const { datafeeds } = await mlClient.getDatafeeds();

    return datafeeds.reduce((acc, cur) => {
      acc[cur.job_id] = cur.datafeed_id;
      return acc;
    }, {} as { [id: string]: string });
  }

  async function getJobIdsByDatafeedId() {
    const { datafeeds } = await mlClient.getDatafeeds();

    return datafeeds.reduce((acc, cur) => {
      acc[cur.datafeed_id] = cur.job_id;
      return acc;
    }, {} as { [id: string]: string });
  }

  async function getDatafeedByJobId(
    jobId: string[],
    excludeGenerated?: boolean
  ): Promise<Datafeed[] | undefined>;

  async function getDatafeedByJobId(
    jobId: string,
    excludeGenerated?: boolean
  ): Promise<Datafeed | undefined>;

  async function getDatafeedByJobId(
    jobId: string | string[],
    excludeGenerated?: boolean
  ): Promise<Datafeed | Datafeed[] | undefined> {
    const jobIds = Array.isArray(jobId) ? jobId : [jobId];

    async function findDatafeed() {
      // if the job was doesn't use the standard datafeedId format
      // get all the datafeeds and match it with the jobId
      const { datafeeds } = await mlClient.getDatafeeds(
        excludeGenerated ? { exclude_generated: true } : {}
      );
      if (typeof jobId === 'string') {
        return datafeeds.find((v) => v.job_id === jobId);
      }

      if (Array.isArray(jobId)) {
        return datafeeds.filter((v) => jobIds.includes(v.job_id));
      }
    }

    // if the job was created by the wizard,
    // then we can assume it uses the standard format of the datafeedId
    const assumedDefaultDatafeedId = jobIds.map((v) => `datafeed-${v}`).join(',');
    try {
      const { datafeeds: datafeedsResults } = await mlClient.getDatafeeds({
        datafeed_id: assumedDefaultDatafeedId,
        ...(excludeGenerated ? { exclude_generated: true } : {}),
      });
      if (Array.isArray(datafeedsResults)) {
        const result = datafeedsResults.filter((d) => jobIds.includes(d.job_id));

        if (typeof jobId === 'string') {
          if (datafeedsResults.length === 1 && datafeedsResults[0].job_id === jobId) {
            return datafeedsResults[0];
          } else {
            return await findDatafeed();
          }
        }

        if (result.length === jobIds.length) {
          return datafeedsResults;
        } else {
          return await findDatafeed();
        }
      } else {
        return await findDatafeed();
      }
    } catch (e) {
      // if assumedDefaultDatafeedId does not exist, ES will throw an error
      return await findDatafeed();
    }
  }

  /**
   * Updates `project_routing` on datafeeds selected by job ID, job group, and/or the `auto` flag.
   * - When `jobIds` and/or `jobGroups` are provided, datafeeds are selected from jobs matching those
   *   filters. If both are provided, a job must be in `jobIds` and belong to at least one `jobGroups` entry.
   * - When only `jobGroups` is defined, jobs are loaded via `getJobs` to resolve group membership.
   * - When `auto` is true, every datafeed with no `project_routing` is also included.
   * - Datafeed IDs are deduplicated in a Set before updates are applied.
   * - When `simulate` is true, no updates are sent; the same selection is returned with `simulated: true` per result.
   * - When `restartRunningJobs` is true (default) and `simulate` is false, datafeeds that are still running
   *   (started) in the update set are stopped first, then updated, then started again without `start`/`end` times.
   * - `results` is keyed by job ID; each value includes the corresponding `datafeedId`.
   */
  async function bulkUpdateProjectRouting(
    projectRouting: string,
    jobIds?: string[],
    jobGroups?: string[],
    autoDetectDatafeeds: boolean = false,
    simulate?: boolean,
    restartRunningJobs: boolean = true
  ) {
    const [{ datafeeds }, { datafeeds: datafeedStats }] = await Promise.all([
      mlClient.getDatafeeds(),
      mlClient.getDatafeedStats(),
    ]);
    const datafeedIdsToUpdate = new Set<string>();

    const hasJobIds = jobIds !== undefined && jobIds.length > 0;
    const hasJobGroups = jobGroups !== undefined;

    if (autoDetectDatafeeds === false && (hasJobIds || hasJobGroups)) {
      let jobIdsMatchingSelection: Set<string> | undefined;

      if (hasJobGroups) {
        const { jobs } = await mlClient.getJobs();
        const jobGroupSet = new Set(jobGroups);
        jobIdsMatchingSelection = new Set(
          jobs
            .filter(
              (job) =>
                Array.isArray(job.groups) && job.groups.some((group) => jobGroupSet.has(group))
            )
            .map((job) => job.job_id)
        );
      }

      if (hasJobIds) {
        const jobIdSet = new Set(jobIds);
        jobIdsMatchingSelection =
          jobIdsMatchingSelection !== undefined
            ? new Set([...jobIdsMatchingSelection].filter((id) => jobIdSet.has(id)))
            : jobIdSet;
      }

      if (jobIdsMatchingSelection !== undefined) {
        for (const df of datafeeds) {
          if (jobIdsMatchingSelection.has(df.job_id)) {
            datafeedIdsToUpdate.add(df.datafeed_id);
          }
        }
      }
    }

    if (autoDetectDatafeeds === true) {
      for (const df of datafeeds) {
        // @ts-expect-error @elastic-elasticsearch datafeed_config type incorrect, missing project_routing
        if (df.project_routing === undefined || df.project_routing === '') {
          datafeedIdsToUpdate.add(df.datafeed_id);
        }
      }
    }

    const datafeedIdToJobId = new Map(
      datafeeds.map((d) => [d.datafeed_id, d.job_id] as [string, string])
    );
    const runningDatafeeds = new Set<string>();
    for (const datafeedStat of datafeedStats) {
      if (
        datafeedStat.state === DATAFEED_STATE.STARTED &&
        datafeedIdsToUpdate.has(datafeedStat.datafeed_id)
      ) {
        runningDatafeeds.add(datafeedStat.datafeed_id);
      }
    }

    const results: {
      [jobId: string]: {
        success: boolean;
        updateError?: unknown;
        stopError?: unknown;
        restartError?: unknown;
        datafeedId: string;
        simulated?: boolean;
      };
    } = Object.create(null);

    // stop any running jobs
    const stopErrors = new Map<string, unknown>();
    if (restartRunningJobs && simulate !== true && runningDatafeeds.size > 0) {
      const stopResults = await stopDatafeeds([...runningDatafeeds], false);
      for (const datafeedId of runningDatafeeds) {
        const r = stopResults[datafeedId];
        if (r === undefined || r.stopped !== true) {
          const err =
            r !== undefined && 'error' in r
              ? (r as { error?: unknown }).error
              : 'datafeed not stopped';
          stopErrors.set(datafeedIdToJobId.get(datafeedId)!, err);
        }
      }
    }

    for (const datafeedId of datafeedIdsToUpdate) {
      const jobId = datafeedIdToJobId.get(datafeedId)!;
      if (simulate === true) {
        results[jobId] = { success: true, datafeedId, simulated: true };
        continue;
      }

      const stopError = stopErrors.get(jobId);
      if (stopError !== undefined) {
        results[jobId] = {
          success: false,
          datafeedId,
          stopError,
        };
        continue;
      }

      // update the datafeed
      try {
        await mlClient.updateDatafeed({
          datafeed_id: datafeedId,
          body: { project_routing: projectRouting },
        });
        results[jobId] = {
          datafeedId,
          success: true,
        };
      } catch (error) {
        const updateError = (error as { body?: unknown }).body ?? error;
        results[jobId] = {
          success: false,
          datafeedId,
          updateError,
        };
      }
    }

    // start any jobs which were previously running
    if (restartRunningJobs && simulate !== true && runningDatafeeds.size > 0) {
      for (const datafeedId of runningDatafeeds) {
        const jobId = datafeedIdToJobId.get(datafeedId)!;
        const perJob = results[jobId];
        if (perJob === undefined || perJob.success !== true) {
          // Do not restart if stop or update did not complete successfully.
          continue;
        }
        try {
          await mlClient.startDatafeed({ datafeed_id: datafeedId });
        } catch (error) {
          const previous = results[jobId] ?? { success: false, datafeedId };
          const restartError = (error as { body?: unknown }).body ?? error;
          results[jobId] = {
            ...previous,
            datafeedId: previous.datafeedId ?? datafeedId,
            success: false,
            restartError,
          };
        }
      }
    }

    return {
      simulate: simulate === true,
      results,
    };
  }

  return {
    forceStartDatafeeds,
    stopDatafeeds,
    forceDeleteDatafeed,
    getDatafeedIdsByJobId,
    getJobIdsByDatafeedId,
    getDatafeedByJobId,
    bulkUpdateProjectRouting,
  };
}

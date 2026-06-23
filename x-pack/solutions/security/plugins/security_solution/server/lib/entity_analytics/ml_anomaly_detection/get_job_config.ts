/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger, SavedObjectsClientContract } from '@kbn/core/server';
import type { MlDetector, QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import { parseDuration } from '@kbn/alerting-plugin/common/parse_duration';
import {
  tactics as mitreTactics,
  techniques as mitreTechniques,
  subtechniques as mitreSubtechniques,
} from '../../../../common/detection_engine/mitre/mitre_tactics_techniques';

export interface JobConfig {
  sourceIndex: string[];
  datafeedQuery: QueryDslQueryContainer;
  detectors: MlDetector[];
  bucketSpanMs: number;
  jobName: string | null;
  threatTactics: string[];
  threatTechniques: string[];
}

interface JobCustomSettings {
  security_app_display_name?: string;
  threat_tactics?: string[];
  threat_techniques?: string[];
}

interface GetJobConfigOpts {
  jobIds: string[];
  logger: Logger;
  ml: MlPluginSetup;
  soClient: SavedObjectsClientContract;
}

const tacticNameById = new Map(mitreTactics.map(({ id, name }) => [id, name]));
const techniqueNameById = new Map(
  [...mitreTechniques, ...mitreSubtechniques].map(({ id, name }) => [id, name])
);

export const getJobConfig = async ({
  jobIds,
  logger,
  ml,
  soClient,
}: GetJobConfigOpts): Promise<Map<string, JobConfig>> => {
  const result = new Map<string, JobConfig>();
  if (!jobIds.length) return result;

  try {
    const jobsSettled = await Promise.allSettled(
      jobIds.map((jobId) =>
        ml
          .anomalyDetectorsProvider({} as KibanaRequest, soClient)
          .jobs(jobId)
          .then((resp) => resp.jobs ?? [])
      )
    );

    const jobs = jobsSettled.flatMap((r) => {
      if (r.status === 'rejected') {
        logger.debug(
          `Failed to fetch job config: ${
            r.reason instanceof Error ? r.reason.message : String(r.reason)
          }`
        );
        return [];
      }
      return r.value;
    });

    for (const job of jobs) {
      const bucketSpanStr = job.analysis_config?.bucket_span;
      let bucketSpanMs = 60 * 60 * 1000; // default to 1h
      if (typeof bucketSpanStr === 'string') {
        try {
          bucketSpanMs = parseDuration(bucketSpanStr);
        } catch {
          logger.warn(`Invalid bucket_span "${bucketSpanStr}" for job ${job.job_id}`);
        }
      }

      const customSettings = (job.custom_settings ?? {}) as JobCustomSettings;

      result.set(job.job_id, {
        sourceIndex: (job.datafeed_config?.indices ?? []) as string[],
        datafeedQuery: (job.datafeed_config?.query as QueryDslQueryContainer) ?? { match_all: {} },
        detectors: job.analysis_config?.detectors ?? [],
        bucketSpanMs,
        jobName: customSettings.security_app_display_name ?? null,
        threatTactics: (customSettings.threat_tactics ?? []).map(
          (id) => tacticNameById.get(id) ?? id
        ),
        threatTechniques: (customSettings.threat_techniques ?? []).map(
          (id) => techniqueNameById.get(id) ?? id
        ),
      });
    }
  } catch (err) {
    logger.error(`Error fetching job configs: ${err instanceof Error ? err.message : String(err)}`);
  }

  return result;
};

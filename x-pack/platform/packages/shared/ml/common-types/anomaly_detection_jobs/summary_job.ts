/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';
import type { Moment } from 'moment';

import type { MlCustomSettings } from '@elastic/elasticsearch/lib/api/types';
import type { CombinedJob, CombinedJobWithStats } from './combined_job';
import type { MlAnomalyDetectionAlertRule } from '../alerts';
import type { MlJobBlocked } from './job';
export type { Datafeed } from './datafeed';
export type { DatafeedStats } from './datafeed_stats';

export type JobActionState = 'deleting' | 'resetting' | 'reverting';

export type SummaryJobState = estypes.MlJobState | JobActionState;

/**
 * A summary of an anomaly detection job.
 */
export interface MlSummaryJob {
  /**
   * The identifier for the anomaly detection job.
   */
  id: string;

  /**
   * A description of the job.
   */
  description: string;

  /**
   * A list of job groups. A job can belong to no groups, one or many.
   */
  groups: string[];

  /**
   * The number of input documents that have been processed by the anomaly detection job.
   * This value includes documents with missing fields, since they are nonetheless analyzed.
   */
  processed_record_count?: number;

  /**
   * The status of the mathematical models, which can take the values ok, soft_limit or hard_limit.
   */
  memory_status?: string;

  /**
   * The status of the job.
   */
  jobState: SummaryJobState;

  /**
   * An array of index names used by the datafeed. Wildcards are supported.
   */
  datafeedIndices: string[];

  /**
   * Flag indicating whether a datafeed exists for the job.
   */
  hasDatafeed: boolean;

  /**
   * The identifier for the datafeed.
   */
  datafeedId: string;

  /**
   * The status of the datafeed.
   */
  datafeedState: string;

  /**
   * The timestamp of the latest chronologically input document.
   */
  latestTimestampMs?: number;

  /**
   * The timestamp of the earliest chronologically input document.
   */
  earliestTimestampMs?: number;

  /**
   * The latest of the timestamp of the latest chronologically input document or the latest bucket that was processed.
   */
  latestResultsTimestampMs?: number;

  /**
   * Used in older implementations of the job config, where the datafeed was placed inside the job for convenience.
   * This will be populated if the job's id has been passed to the /internal/ml/jobs/jobs_summary endpoint.
   */
  fullJob?: CombinedJob;

  /**
   * The name of the node that runs the job.
   */
  nodeName?: string;

  /**
   * Audit message for the job.
   */
  auditMessage?: Partial<AuditMessage>;

  /**
   * Flag indicating whether results of the job can be viewed in the Single Metric Viewer.
   */
  isSingleMetricViewerJob: boolean;

  /**
   * For jobs which cannot be viewed in the Single Metric Viewer, a message indicating the reason why
   * results for the job cannot be viewed in the Single Metric Viewer.
   */
  isNotSingleMetricViewerJobMessage?: string;

  /**
   * When present, it explains that a task is currently running on the job, which is stopping
   * any other actions from being performed on the job.
   */
  blocked?: MlJobBlocked;

  /**
   * Value of the latest timestamp for the job used for sorting.
   */
  latestTimestampSortValue?: number;

  /**
   * The earlist of the timestamp of the earliest chronologically input document or the earliest bucket that was processed.
   */
  earliestStartTimestampMs?: number;

  /**
   * Indicates whether the job is currently awaiting assignment to a node before opening.
   */
  awaitingNodeAssignment: boolean;

  /**
   * List of anomaly detection alerting rules configured for the job.
   */
  alertingRules?: MlAnomalyDetectionAlertRule[];

  /**
   * List of tags that have been added to the job.
   */
  jobTags: Record<string, string>;

  /**
   * The size of the interval that the analysis is aggregated into, typically between 5m and 1h.
   */
  bucketSpanSeconds: number;

  /**
   * When CPS (Cross-Project Search) is enabled, the datafeed `project_routing` value.
   * `null` when CPS is enabled but the datafeed has no `project_routing`.
   * Omitted when CPS is disabled.
   */
  projectRouting?: string | null;

  /**
   * Advanced configuration option. Contains custom meta data about the job. For example, it can contain custom URL information.
   */
  customSettings?: MlCustomSettings;
}

export interface AuditMessage {
  job_id: string;
  msgTime: number;
  level?: string;
  highestLevel: string;
  highestLevelText: string;
  text?: string;
  cleared?: boolean;
}

export type MlSummaryJobs = MlSummaryJob[];

export interface MlJobTimeRange {
  from: number;
  to: number;
  fromPx: number;
  toPx: number;
  fromMoment: Moment | null;
  toMoment: Moment | null;
  widthPx: number | null;
  label?: string;
}

export interface MlJobWithTimeRange extends CombinedJobWithStats {
  id: string;
  isRunning?: boolean;
  isNotSingleMetricViewerJobMessage?: string;
  timeRange: MlJobTimeRange;
}

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';
import { useMemo } from 'react';
import type { AggFieldNamePair } from '@kbn/ml-anomaly-utils';
import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { CategorizationAnalyzer, FieldValidationResults } from '@kbn/ml-category-validator';

import type { Dictionary } from '@kbn/ml-common-types/common';
import type {
  MlJobWithTimeRange,
  MlSummaryJobs,
} from '@kbn/ml-common-types/anomaly_detection_jobs/summary_job';
import type { CombinedJobWithStats } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { Job } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type {
  Datafeed,
  IndicesOptions,
} from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { JobMessage } from '@kbn/ml-common-types/audit_message';
import type { Group } from '@kbn/ml-common-types/groups';

import type { Category } from '@kbn/ml-common-types/categories';
import type {
  JobsExistResponse,
  BulkCreateResults,
  BulkUpdateProjectRoutingResponse,
  ResetJobsResponse,
} from '@kbn/ml-common-types/job_service';
import type { ExistingJobsAndGroups } from '../job_service';
import type { JobAction } from '../../../../common/constants/job_actions';
import { useMlKibana } from '../../contexts/kibana';
import type { HttpService } from '../http_service';
import { ML_INTERNAL_BASE_PATH } from '../../../../common/constants/app';

export const jobsApiProvider = (httpService: HttpService) => ({
  jobsSummary(jobIds: string[]) {
    const body = JSON.stringify({ jobIds });
    return httpService.http<MlSummaryJobs>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_summary`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  jobIdsWithGeo() {
    return httpService.http<string[]>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_with_geo`,
      method: 'GET',
      version: '1',
    });
  },

  jobsWithTimerange(dateFormatTz: string) {
    const body = JSON.stringify({ dateFormatTz });
    return httpService.http<{
      jobs: MlJobWithTimeRange[];
      jobsMap: Dictionary<MlJobWithTimeRange>;
    }>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_with_time_range`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  jobForCloning(jobId: string, retainCreatedBy = false) {
    const body = JSON.stringify({ jobId, retainCreatedBy });
    return httpService.http<{ job?: Job; datafeed?: Datafeed } | undefined>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/job_for_cloning`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  jobs(jobIds: string[]) {
    const body = JSON.stringify({ jobIds });
    return httpService.http<CombinedJobWithStats[]>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  groups() {
    return httpService.http<Group[]>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/groups`,
      method: 'GET',
      version: '1',
    });
  },

  updateGroups(updatedJobs: Array<{ jobId: string; groups: string[] }>) {
    const body = JSON.stringify({ jobs: updatedJobs });
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/update_groups`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  forceStartDatafeeds(datafeedIds: string[], start: string, end: string) {
    const body = JSON.stringify({
      datafeedIds,
      start,
      end,
    });

    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/force_start_datafeeds`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  stopDatafeeds(datafeedIds: string[], closeJobs?: boolean) {
    const body = JSON.stringify({ datafeedIds, closeJobs });
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/stop_datafeeds`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  deleteJobs(jobIds: string[], deleteUserAnnotations?: boolean, deleteAlertingRules?: boolean) {
    const body = JSON.stringify({ jobIds, deleteUserAnnotations, deleteAlertingRules });
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/delete_jobs`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  closeJobs(jobIds: string[]) {
    const body = JSON.stringify({ jobIds });
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/close_jobs`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  resetJobs(jobIds: string[], deleteUserAnnotations?: boolean) {
    const body = JSON.stringify({ jobIds, deleteUserAnnotations });
    return httpService.http<ResetJobsResponse>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/reset_jobs`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  forceStopAndCloseJob(jobId: string) {
    const body = JSON.stringify({ jobId });
    return httpService.http<{ success: boolean }>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/force_stop_and_close_job`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  jobAuditMessages({
    jobId,
    from,
    start,
    end,
  }: {
    jobId: string;
    from?: number;
    start?: string;
    end?: string;
  }) {
    const jobIdString = jobId !== undefined ? `/${jobId}` : '';
    const query = {
      ...(from !== undefined ? { from } : {}),
      ...(start !== undefined && end !== undefined ? { start, end } : {}),
    };

    return httpService.http<{ messages: JobMessage[]; notificationIndices: string[] }>({
      path: `${ML_INTERNAL_BASE_PATH}/job_audit_messages/messages${jobIdString}`,
      method: 'GET',
      query,
      version: '1',
    });
  },

  clearJobAuditMessages(jobId: string, notificationIndices: string[]) {
    const body = JSON.stringify({ jobId, notificationIndices });
    return httpService.http<{ success: boolean; latest_cleared: number }>({
      path: `${ML_INTERNAL_BASE_PATH}/job_audit_messages/clear_messages`,
      method: 'PUT',
      body,
      version: '1',
    });
  },

  blockingJobTasks() {
    return httpService.http<Record<string, JobAction>>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/blocking_jobs_tasks`,
      method: 'GET',
      version: '1',
    });
  },

  jobsExist(jobIds: string[], allSpaces: boolean = false) {
    const body = JSON.stringify({ jobIds, allSpaces });
    return httpService.http<JobsExistResponse>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_exist`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  jobsExist$(jobIds: string[], allSpaces: boolean = false): Observable<JobsExistResponse> {
    const body = JSON.stringify({ jobIds, allSpaces });
    return httpService.http$({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/jobs_exist`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  newJobCaps(indexPatternTitle: string, isRollup: boolean = false) {
    const query = isRollup === true ? { rollup: true } : {};
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/new_job_caps/${indexPatternTitle}`,
      method: 'GET',
      query,
      version: '1',
    });
  },

  newJobLineChart(
    indexPatternTitle: string,
    timeField: string,
    start: number,
    end: number,
    intervalMs: number,
    query: any,
    aggFieldNamePairs: AggFieldNamePair[],
    splitFieldName: string | null,
    splitFieldValue: string | null,
    runtimeMappings?: RuntimeMappings,
    indicesOptions?: IndicesOptions,
    projectRouting?: string
  ) {
    const body = JSON.stringify({
      indexPatternTitle,
      timeField,
      start,
      end,
      intervalMs,
      query,
      aggFieldNamePairs,
      splitFieldName,
      splitFieldValue,
      runtimeMappings,
      indicesOptions,
      projectRouting,
    });
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/new_job_line_chart`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  newJobPopulationsChart(
    indexPatternTitle: string,
    timeField: string,
    start: number,
    end: number,
    intervalMs: number,
    query: any,
    aggFieldNamePairs: AggFieldNamePair[],
    splitFieldName: string,
    runtimeMappings?: RuntimeMappings,
    indicesOptions?: IndicesOptions,
    projectRouting?: string
  ) {
    const body = JSON.stringify({
      indexPatternTitle,
      timeField,
      start,
      end,
      intervalMs,
      query,
      aggFieldNamePairs,
      splitFieldName,
      runtimeMappings,
      indicesOptions,
      projectRouting,
    });
    return httpService.http<any>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/new_job_population_chart`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  getAllJobAndGroupIds() {
    return httpService.http<ExistingJobsAndGroups>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/all_jobs_and_group_ids`,
      method: 'GET',
      version: '1',
    });
  },

  getLookBackProgress(jobId: string, start: number, end: number) {
    const body = JSON.stringify({
      jobId,
      start,
      end,
    });
    return httpService.http<{ progress: number; isRunning: boolean; isJobClosed: boolean }>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/look_back_progress`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  categorizationFieldExamples(
    indexPatternTitle: string,
    query: any,
    size: number,
    field: string,
    timeField: string,
    start: number,
    end: number,
    analyzer: CategorizationAnalyzer,
    runtimeMappings?: RuntimeMappings,
    indicesOptions?: IndicesOptions,
    projectRouting?: string,
    includeExamples?: boolean
  ) {
    const body = JSON.stringify({
      indexPatternTitle,
      query,
      size,
      field,
      timeField,
      start,
      end,
      analyzer,
      runtimeMappings,
      indicesOptions,
      projectRouting,
      includeExamples,
    });
    return httpService.http<FieldValidationResults>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/categorization_field_validation`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  topCategories(jobId: string, count: number) {
    const body = JSON.stringify({ jobId, count });
    return httpService.http<{
      total: number;
      categories: Array<{ count?: number; category: Category }>;
    }>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/top_categories`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  revertModelSnapshot(
    jobId: string,
    snapshotId: string,
    replay: boolean,
    end?: number,
    calendarEvents?: Array<{ start: number; end: number; description: string }>
  ) {
    const body = JSON.stringify({ jobId, snapshotId, replay, end, calendarEvents });
    return httpService.http<{
      success: boolean;
    }>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/revert_model_snapshot`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  datafeedPreview(datafeedId?: string, job?: Job, datafeed?: Datafeed) {
    const body = JSON.stringify({ datafeedId, job, datafeed });
    return httpService.http<unknown[]>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/datafeed_preview`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  bulkCreateJobs(jobs: { job: Job; datafeed: Datafeed } | Array<{ job: Job; datafeed: Datafeed }>) {
    const body = JSON.stringify(jobs);
    return httpService.http<BulkCreateResults>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/bulk_create`,
      method: 'POST',
      body,
      version: '1',
    });
  },

  bulkUpdateProjectRouting({
    projectRouting,
    jobIds,
    auto,
    simulate,
    restartRunningJobs,
  }: {
    projectRouting: string;
    jobIds?: string[];
    auto?: boolean;
    simulate?: boolean;
    restartRunningJobs?: boolean;
  }) {
    const body = JSON.stringify({ projectRouting, jobIds, auto, simulate, restartRunningJobs });
    return httpService.http<BulkUpdateProjectRoutingResponse>({
      path: `${ML_INTERNAL_BASE_PATH}/jobs/bulk_update_project_routing`,
      method: 'POST',
      body,
      version: '1',
    });
  },
});

export type JobsApiService = ReturnType<typeof jobsApiProvider>;

/**
 * Hooks for accessing {@link JobsApiService} in React components.
 */
export function useJobsApiService(): JobsApiService {
  const {
    services: {
      mlServices: { httpService },
    },
  } = useMlKibana();
  return useMemo(() => jobsApiProvider(httpService), [httpService]);
}

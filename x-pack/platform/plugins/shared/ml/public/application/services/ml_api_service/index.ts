/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Observable } from 'rxjs';

import type { estypes } from '@elastic/elasticsearch';

import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';

import { chunk, isNumber } from 'lodash';
import type {
  MlServerDefaults,
  MlServerLimits,
  MlNodeCount,
} from '@kbn/ml-common-types/ml_server_info';
import type { MlCapabilitiesResponse } from '@kbn/ml-common-types/capabilities';
import type { RecognizeModuleResult } from '@kbn/ml-common-types/modules';
import type { MlCalendar, MlCalendarId, UpdateCalendar } from '@kbn/ml-common-types/calendars';
import type { BucketSpanEstimatorData } from '@kbn/ml-common-types/job_service';
import type { Job, AnalysisConfig } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { JobStats } from '@kbn/ml-common-types/anomaly_detection_jobs/job_stats';
import type {
  Datafeed,
  IndicesOptions,
} from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { CombinedJob } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { ModelSnapshot } from '@kbn/ml-common-types/anomaly_detection_jobs/model_snapshot';
import type {
  DataRecognizerConfigResponse,
  Module,
  RecognizeResult,
} from '@kbn/ml-common-types/modules';
import type { DatafeedValidationResponse } from '@kbn/ml-common-types/job_validation';
import { ML_INTERNAL_BASE_PATH } from '../../../../common/constants/app';

import type { FieldHistogramRequestConfig } from '../../datavisualizer/index_based/common/request';

import type { HttpService } from '../http_service';

import { jsonSchemaProvider } from './json_schema';
import { annotationsApiProvider } from './annotations';
import { dataFrameAnalyticsApiProvider } from './data_frame_analytics';
import { filtersApiProvider } from './filters';
import { resultsApiProvider } from './results';
import { jobsApiProvider } from './jobs';
import { savedObjectsApiProvider } from './saved_objects';
import { trainedModelsApiProvider } from './trained_models';
import { notificationsProvider } from './notifications';
import { inferenceModelsApiProvider } from './inference_models';

export interface MlHasPrivilegesResponse {
  hasPrivileges?: estypes.SecurityHasPrivilegesResponse;
  upgradeInProgress: boolean;
}

export interface MlInfoResponse {
  defaults: MlServerDefaults;
  limits: MlServerLimits;
  native_code: {
    build_hash: string;
    version: string;
  };
  upgrade_mode: boolean;
  cloudId?: string;
  isCloudTrial?: boolean;
  cloudUrl?: string;
  isMlAutoscalingEnabled: boolean;
  showNodeInfo: boolean;
  showLicenseInfo: boolean;
}

export interface BucketSpanEstimatorResponse {
  name: string;
  ms: number;
  error?: boolean;
  message?: string;
}

export interface GetTimeFieldRangeResponse {
  success: boolean;
  start: number;
  end: number;
}

export interface SuccessCardinality {
  id: 'success_cardinality';
}

export interface CardinalityModelPlotHigh {
  id: 'cardinality_model_plot_high';
  modelPlotCardinality: number;
}

export type CardinalityValidationResult = SuccessCardinality | CardinalityModelPlotHigh;
export type CardinalityValidationResults = CardinalityValidationResult[];

export interface GetModelSnapshotsResponse {
  count: number;
  model_snapshots: ModelSnapshot[];
}

export interface DeleteForecastResponse {
  acknowledged: boolean;
}

export function mlApiProvider(httpService: HttpService) {
  return {
    getJobs(obj?: { jobId?: string }) {
      const jobId = obj && obj.jobId ? `/${obj.jobId}` : '';
      return httpService.http<{ jobs: Job[]; count: number }>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors${jobId}`,
        version: '1',
      });
    },

    getJobs$(obj?: { jobId?: string }) {
      const jobId = obj && obj.jobId ? `/${obj.jobId}` : '';
      return httpService.http$<{ count: number; jobs: Job[] }>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors${jobId}`,
        version: '1',
      });
    },

    getJobStats(obj: { jobId?: string }) {
      const jobId = obj && obj.jobId ? `/${obj.jobId}` : '';
      return httpService.http<{ jobs: JobStats[]; count: number }>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors${jobId}/_stats`,
        version: '1',
      });
    },

    addJob({ jobId, job }: { jobId: string; job: Job }) {
      const body = JSON.stringify(job);
      return httpService.http<estypes.MlPutJobResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}`,
        method: 'PUT',
        body,
        version: '1',
      });
    },

    openJob({ jobId }: { jobId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/_open`,
        method: 'POST',
        version: '1',
      });
    },

    closeJob({ jobId }: { jobId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/_close`,
        method: 'POST',
        version: '1',
      });
    },

    forceCloseJob({ jobId }: { jobId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/_close?force=true`,
        method: 'POST',
        version: '1',
      });
    },

    deleteJob({ jobId }: { jobId: string }) {
      return httpService.http<estypes.MlDeleteJobResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}`,
        method: 'DELETE',
        version: '1',
      });
    },

    forceDeleteJob({ jobId }: { jobId: string }) {
      return httpService.http<estypes.MlDeleteJobResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}?force=true`,
        method: 'DELETE',
        version: '1',
      });
    },

    updateJob({ jobId, job }: { jobId: string; job: Job }) {
      const body = JSON.stringify(job);
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/_update`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    estimateBucketSpan(obj: BucketSpanEstimatorData) {
      const body = JSON.stringify(obj);
      return httpService.http<BucketSpanEstimatorResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/validate/estimate_bucket_span`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    validateJob(payload: {
      job: CombinedJob;
      duration: {
        start?: number;
        end?: number;
      };
      fields?: any[];
    }) {
      const body = JSON.stringify(payload);
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/validate/job`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    validateDatafeedPreview(payload: { job: CombinedJob; start?: number; end?: number }) {
      const body = JSON.stringify(payload);
      return httpService.http<DatafeedValidationResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/validate/datafeed_preview`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    validateCardinality$(job: CombinedJob): Observable<CardinalityValidationResults> {
      const body = JSON.stringify(job);
      return httpService.http$({
        path: `${ML_INTERNAL_BASE_PATH}/validate/cardinality`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    getDatafeeds(obj: { datafeedId: string }) {
      const datafeedId = obj && obj.datafeedId ? `/${obj.datafeedId}` : '';
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds${datafeedId}`,
        version: '1',
      });
    },

    getDatafeedStats(obj: { datafeedId: string }) {
      const datafeedId = obj && obj.datafeedId ? `/${obj.datafeedId}` : '';
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds${datafeedId}/_stats`,
        version: '1',
      });
    },

    addDatafeed({ datafeedId, datafeedConfig }: { datafeedId: string; datafeedConfig: Datafeed }) {
      const body = JSON.stringify(datafeedConfig);
      return httpService.http<estypes.MlPutDatafeedResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}`,
        method: 'PUT',
        body,
        version: '1',
      });
    },

    updateDatafeed({
      datafeedId,
      datafeedConfig,
    }: {
      datafeedId: string;
      datafeedConfig: Partial<Datafeed>;
    }) {
      const body = JSON.stringify(datafeedConfig);
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}/_update`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    deleteDatafeed({ datafeedId }: { datafeedId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}`,
        method: 'DELETE',
        version: '1',
      });
    },

    forceDeleteDatafeed({ datafeedId }: { datafeedId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}?force=true`,
        method: 'DELETE',
        version: '1',
      });
    },

    startDatafeed({
      datafeedId,
      start,
      end,
    }: {
      datafeedId: string;
      start?: number;
      end?: number;
    }) {
      // if the end timestamp is a number, add one ms to it to make it
      // inclusive of the end of the data
      if (isNumber(end)) {
        end++;
      }

      const body = JSON.stringify({
        ...(start !== undefined ? { start } : {}),
        ...(end !== undefined ? { end } : {}),
      });

      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}/_start`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    stopDatafeed({ datafeedId }: { datafeedId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}/_stop`,
        method: 'POST',
        version: '1',
      });
    },

    forceStopDatafeed({ datafeedId }: { datafeedId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}/_stop?force=true`,
        method: 'POST',
        version: '1',
      });
    },

    datafeedPreview({ datafeedId }: { datafeedId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/datafeeds/${datafeedId}/_preview`,
        method: 'GET',
        version: '1',
      });
    },

    forecast({
      jobId,
      duration,
      neverExpires,
    }: {
      jobId: string;
      duration?: string;
      neverExpires?: boolean;
    }) {
      const body = JSON.stringify({
        ...(duration !== undefined ? { duration } : {}),
        ...(neverExpires === true ? { expires_in: '0' } : {}),
      });

      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/_forecast`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    deleteForecast({ jobId, forecastId }: { jobId: string; forecastId: string }) {
      return httpService.http<DeleteForecastResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/_forecast/${forecastId}`,
        method: 'DELETE',
        version: '1',
      });
    },

    overallBuckets({
      jobId,
      topN,
      bucketSpan,
      start,
      end,
      overallScore,
    }: {
      jobId: string[];
      topN: string;
      bucketSpan: string;
      start: number;
      end: number;
      overallScore?: number;
    }): Promise<estypes.MlGetOverallBucketsResponse> {
      const body = JSON.stringify({
        topN,
        bucketSpan,
        start,
        end,
        ...(overallScore ? { overall_score: overallScore } : {}),
      });

      // Max permitted job_id is 64 characters, so we can fit around 30 jobs per request
      const maxJobsPerRequest = 30;

      return Promise.all(
        chunk(jobId, maxJobsPerRequest).map((jobIdsChunk) => {
          return httpService.http<estypes.MlGetOverallBucketsResponse>({
            path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobIdsChunk.join(
              ','
            )}/results/overall_buckets`,
            method: 'POST',
            body,
            version: '1',
          });
        })
      ).then((responses) => {
        // Merge responses
        return responses.reduce<estypes.MlGetOverallBucketsResponse>(
          (acc, response) => {
            acc.count += response.count;
            acc.overall_buckets.push(...response.overall_buckets);
            return acc;
          },
          { count: 0, overall_buckets: [] }
        );
      });
    },

    hasPrivileges(obj: any) {
      const body = JSON.stringify(obj);
      return httpService.http<MlHasPrivilegesResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/_has_privileges`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    checkMlCapabilities() {
      return httpService.http<MlCapabilitiesResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/ml_capabilities`,
        method: 'GET',
        version: '1',
      });
    },

    checkIndicesExists({ indices }: { indices: string[] }) {
      const body = JSON.stringify({ indices });

      return httpService.http<Record<string, { exists: boolean }>>({
        path: `${ML_INTERNAL_BASE_PATH}/index_exists`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    recognizeIndex({
      indexPatternTitle,
      filter,
    }: {
      indexPatternTitle: string;
      filter?: string[];
    }) {
      return httpService.http<RecognizeResult[]>({
        path: `${ML_INTERNAL_BASE_PATH}/modules/recognize/${indexPatternTitle}`,
        method: 'GET',
        version: '1',
        query: { filter: filter?.join(',') },
      });
    },

    recognizeModule({ moduleId, size }: { moduleId: string; size?: number }) {
      return httpService.http<RecognizeModuleResult>({
        path: `${ML_INTERNAL_BASE_PATH}/modules/recognize_by_module/${moduleId}`,
        method: 'GET',
        version: '1',
        query: { size },
      });
    },

    listDataRecognizerModules(filter?: string[]) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/modules/get_module`,
        method: 'GET',
        version: '1',
        query: { filter: filter?.join(',') },
      });
    },

    getDataRecognizerModule(params?: { moduleId: string; filter?: string[] }) {
      const { moduleId, filter } = params || {};
      return httpService.http<Module | Module[]>({
        path: `${ML_INTERNAL_BASE_PATH}/modules/get_module/${moduleId ?? ''}`,
        method: 'GET',
        version: '1',
        query: { filter: filter?.join(',') },
      });
    },

    dataRecognizerModuleJobsExist({ moduleId }: { moduleId: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/modules/jobs_exist/${moduleId}`,
        method: 'GET',
        version: '1',
      });
    },

    setupDataRecognizerConfig({
      moduleId,
      prefix,
      groups,
      indexPatternName,
      query,
      useDedicatedIndex,
      startDatafeed,
      start,
      end,
      jobOverrides,
      estimateModelMemory,
      projectRouting,
    }: {
      moduleId: string;
      prefix?: string;
      groups?: string[];
      indexPatternName?: string;
      query?: any;
      useDedicatedIndex?: boolean;
      startDatafeed?: boolean;
      start?: number;
      end?: number;
      jobOverrides?: Array<Partial<Job>>;
      estimateModelMemory?: boolean;
      projectRouting?: string;
    }) {
      const body = JSON.stringify({
        prefix,
        groups,
        indexPatternName,
        query,
        useDedicatedIndex,
        startDatafeed,
        start,
        end,
        jobOverrides,
        estimateModelMemory,
        projectRouting,
      });

      return httpService.http<DataRecognizerConfigResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/modules/setup/${moduleId}`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    getVisualizerFieldHistograms({
      indexPattern,
      query,
      fields,
      samplerShardSize,
      runtimeMappings,
      projectRouting,
    }: {
      indexPattern: string;
      query: any;
      fields: FieldHistogramRequestConfig[];
      samplerShardSize?: number;
      runtimeMappings?: RuntimeMappings;
      projectRouting?: string;
    }) {
      const body = JSON.stringify({
        query,
        fields,
        samplerShardSize,
        runtimeMappings,
        projectRouting,
      });

      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/data_visualizer/get_field_histograms/${indexPattern}`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    /**
     * Gets a list of calendars
     * @param obj
     * @returns {Promise<MlCalendar[]>}
     */
    calendars(obj?: { calendarId?: MlCalendarId; calendarIds?: MlCalendarId[] }) {
      const { calendarId, calendarIds } = obj || {};
      let calendarIdsPathComponent = '';
      if (calendarId) {
        calendarIdsPathComponent = `/${calendarId}`;
      } else if (calendarIds) {
        calendarIdsPathComponent = `/${calendarIds.join(',')}`;
      }
      return httpService.http<MlCalendar[]>({
        path: `${ML_INTERNAL_BASE_PATH}/calendars${calendarIdsPathComponent}`,
        method: 'GET',
        version: '1',
      });
    },

    addCalendar(obj: MlCalendar) {
      const body = JSON.stringify(obj);
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/calendars`,
        method: 'PUT',
        body,
        version: '1',
      });
    },

    updateCalendar(obj: UpdateCalendar) {
      const calendarId = obj && obj.calendarId ? `/${obj.calendarId}` : '';
      const body = JSON.stringify(obj);
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/calendars${calendarId}`,
        method: 'PUT',
        body,
        version: '1',
      });
    },

    deleteCalendar({ calendarId }: { calendarId?: string }) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/calendars/${calendarId}`,
        method: 'DELETE',
        version: '1',
      });
    },

    mlNodeCount() {
      return httpService.http<MlNodeCount>({
        path: `${ML_INTERNAL_BASE_PATH}/ml_node_count`,
        method: 'GET',
        version: '1',
      });
    },

    mlInfo() {
      return httpService.http<MlInfoResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/info`,
        method: 'GET',
        version: '1',
      });
    },

    calculateModelMemoryLimit$({
      datafeedConfig,
      analysisConfig,
      indexPattern,
      query,
      timeFieldName,
      earliestMs,
      latestMs,
    }: {
      datafeedConfig?: Datafeed;
      analysisConfig: AnalysisConfig;
      indexPattern: string;
      query: any;
      timeFieldName: string;
      earliestMs: number;
      latestMs: number;
    }) {
      const body = JSON.stringify({
        datafeedConfig,
        analysisConfig,
        indexPattern,
        query,
        timeFieldName,
        earliestMs,
        latestMs,
      });

      return httpService.http$<{ modelMemoryLimit: string }>({
        path: `${ML_INTERNAL_BASE_PATH}/validate/calculate_model_memory_limit`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    getCardinalityOfFields({
      index,
      fieldNames,
      query,
      timeFieldName,
      earliestMs,
      latestMs,
      datafeed,
    }: {
      index: string;
      fieldNames: string[];
      query: any;
      timeFieldName: string;
      earliestMs: number;
      latestMs: number;
      datafeed?: Datafeed;
    }) {
      const body = JSON.stringify({
        index,
        fieldNames,
        query,
        timeFieldName,
        earliestMs,
        latestMs,
        datafeed,
      });

      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/fields_service/field_cardinality`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    getTimeFieldRange({
      index,
      timeFieldName,
      query,
      runtimeMappings,
      indicesOptions,
      allowFutureTime,
      projectRouting,
    }: {
      index: string;
      timeFieldName?: string;
      query: any;
      runtimeMappings?: RuntimeMappings;
      indicesOptions?: IndicesOptions;
      allowFutureTime?: boolean;
      projectRouting?: string;
    }) {
      const body = JSON.stringify({
        index,
        timeFieldName,
        query,
        runtimeMappings,
        indicesOptions,
        allowFutureTime,
        projectRouting,
      });

      return httpService.http<GetTimeFieldRangeResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/fields_service/time_field_range`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    esSearch(obj: any) {
      const body = JSON.stringify(obj);
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/es_search`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    esSearch$(obj: any) {
      const body = JSON.stringify(obj);
      return httpService.http$<any>({
        path: `${ML_INTERNAL_BASE_PATH}/es_search`,
        method: 'POST',
        body,
        version: '1',
      });
    },

    getIndices() {
      const tempBasePath = '/api';
      return httpService.http<Array<{ name: string }>>({
        path: `${tempBasePath}/index_management/indices`,
        method: 'GET',
        version: '1',
      });
    },

    getModelSnapshots(jobId: string, snapshotId?: string) {
      return httpService.http<GetModelSnapshotsResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/model_snapshots${
          snapshotId !== undefined ? `/${snapshotId}` : ''
        }`,
        version: '1',
      });
    },

    updateModelSnapshot(
      jobId: string,
      snapshotId: string,
      body: { description?: string; retain?: boolean }
    ) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/model_snapshots/${snapshotId}/_update`,
        method: 'POST',
        body: JSON.stringify(body),
        version: '1',
      });
    },

    deleteModelSnapshot(jobId: string, snapshotId: string) {
      return httpService.http<any>({
        path: `${ML_INTERNAL_BASE_PATH}/anomaly_detectors/${jobId}/model_snapshots/${snapshotId}`,
        method: 'DELETE',
        version: '1',
      });
    },

    reindexWithPipeline(pipelineName: string, sourceIndex: string, destinationIndex: string) {
      return httpService.http<estypes.ReindexResponse>({
        path: `${ML_INTERNAL_BASE_PATH}/reindex_with_pipeline`,
        method: 'POST',
        body: JSON.stringify({
          source: {
            index: sourceIndex,
          },
          dest: {
            index: destinationIndex,
            pipeline: pipelineName,
          },
        }),
        version: '1',
      });
    },

    annotations: annotationsApiProvider(httpService),
    dataFrameAnalytics: dataFrameAnalyticsApiProvider(httpService),
    filters: filtersApiProvider(httpService),
    results: resultsApiProvider(httpService),
    jobs: jobsApiProvider(httpService),
    savedObjects: savedObjectsApiProvider(httpService),
    trainedModels: trainedModelsApiProvider(httpService),
    inferenceModels: inferenceModelsApiProvider(httpService),
    notifications: notificationsProvider(httpService),
    jsonSchema: jsonSchemaProvider(httpService),
  };
}

export type MlApi = ReturnType<typeof mlApiProvider>;

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * utils for Anomaly Explorer.
 */

import { get, union, uniq } from 'lodash';
import moment from 'moment-timezone';
import { lastValueFrom } from 'rxjs';

import { ES_FIELD_TYPES } from '@kbn/field-types';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';
import { extractErrorMessage } from '@kbn/ml-error-utils';
import {
  getEntityFieldList,
  type MlEntityField,
  type MlRecordForInfluencer,
  ML_JOB_AGGREGATION,
} from '@kbn/ml-anomaly-utils';
import type { InfluencersFilterQuery, MlAnomaliesTableRecordExtended } from '@kbn/ml-anomaly-utils';
import type { TimeRangeBounds } from '@kbn/ml-time-buckets';
import type { IUiSettingsClient } from '@kbn/core/public';
import { parseInterval } from '@kbn/ml-parse-interval';
import type { SwimlaneType } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import { SWIMLANE_TYPE } from '@kbn/ml-common-types/embeddables/swimlane_type';

import type { CombinedJob } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import type { Annotations, AnnotationsTable } from '@kbn/ml-common-types/annotations';
import {
  ANNOTATIONS_TABLE_DEFAULT_QUERY_SIZE,
  ANOMALIES_TABLE_DEFAULT_QUERY_SIZE,
} from '../../../common/constants/search';
import type { MlIndexUtils } from '../util/index_service';
import {
  isSourceDataChartableForDetector,
  isModelPlotChartableForDetector,
  isModelPlotEnabled,
  isTimeSeriesViewJob,
} from '../../../common/util/job_utils';
import type { MlJobService } from '../services/job_service';
import { MAX_CATEGORY_EXAMPLES, VIEW_BY_JOB_LABEL } from './explorer_constants';
import { useMlKibana } from '../contexts/kibana';
import type { MlApi } from '../services/ml_api_service';
import { ML_RESULTS_INDEX_PATTERN } from '../../../common/constants/index_patterns';
import type { GroupObj } from '../components/job_selector/job_selector';
import type { TableSeverityState } from '../components/controls/select_severity';

export interface ExplorerJob {
  id: string;
  selected: boolean;
  bucketSpanSeconds: number;
  isSingleMetricViewerJob?: boolean;
  sourceIndices?: string[];
  modelPlotEnabled: boolean;
  groups?: string[];
}

export function isExplorerJob(arg: unknown): arg is ExplorerJob {
  return (
    isPopulatedObject(arg) &&
    typeof arg.id === 'string' &&
    arg.selected !== undefined &&
    arg.bucketSpanSeconds !== undefined
  );
}

interface ClearedSelectedAnomaliesState {
  selectedCells: undefined;
}

export interface SwimlanePoint {
  laneLabel: string;
  time: number;
  value: number;
}

export interface SwimlaneData {
  fieldName?: string;
  laneLabels: string[];
  points: SwimlanePoint[];
  interval: number;
}

export interface AppStateSelectedCells {
  type: SwimlaneType;
  lanes: string[];
  times: [number, number];
  showTopFieldValues?: boolean;
  viewByFieldName?: string;
}

interface SelectionTimeRange {
  earliestMs: number;
  latestMs: number;
}

export interface AnomaliesTableData {
  anomalies: any[];
  interval: number | string;
  examplesByJobId: Record<string, Record<string, string[]>>;
  showViewSeriesLink: boolean;
  jobIds: string[];
}

export interface ChartRecord extends MlRecordForInfluencer {
  function: string;
}

export interface OverallSwimlaneData extends SwimlaneData {
  /**
   * Earliest timestamp in seconds
   */
  earliest: number;
  /**
   * Latest timestamp in seconds
   */
  latest: number;
}

export interface ViewBySwimLaneData extends OverallSwimlaneData {
  cardinality: number;
}

export interface SourceIndexGeoFields {
  [key: string]: { geoFields: string[]; dataViewId: string };
}

export interface SourceIndicesWithGeoFields {
  [key: string]: SourceIndexGeoFields;
}

// create new job objects based on standard job config objects
export function createJobs(jobs: CombinedJob[]): ExplorerJob[] {
  return jobs.map((job) => {
    const bucketSpan = parseInterval(job.analysis_config.bucket_span!);
    return {
      id: job.job_id,
      selected: false,
      bucketSpanSeconds: bucketSpan!.asSeconds(),
      isSingleMetricViewerJob: isTimeSeriesViewJob(job),
      sourceIndices: job.datafeed_config.indices,
      modelPlotEnabled: job.model_plot_config?.enabled === true,
      groups: job.groups,
    };
  });
}

export function getClearedSelectedAnomaliesState(): ClearedSelectedAnomaliesState {
  return {
    selectedCells: undefined,
  };
}

export function getDefaultSwimlaneData(): SwimlaneData {
  return {
    fieldName: '',
    laneLabels: [],
    points: [],
    interval: 3600,
  };
}

export function getInfluencers(mlJobService: MlJobService, selectedJobs: any[]): string[] {
  const influencers: string[] = [];
  selectedJobs.forEach((selectedJob) => {
    const job = mlJobService.getJob(selectedJob.id);
    if (job !== undefined && job.analysis_config && job.analysis_config.influencers) {
      influencers.push(...job.analysis_config.influencers);
    }
  });
  return influencers;
}

export function useDateFormatTz(): string {
  const { services } = useMlKibana();
  const { uiSettings } = services;
  // Pass the timezone to the server for use when aggregating anomalies (by day / hour) for the table.
  const tzConfig = uiSettings.get('dateFormat:tz');
  const dateFormatTz = tzConfig !== 'Browser' ? tzConfig : moment.tz.guess();
  return dateFormatTz;
}

export function getDateFormatTz(uiSettings: IUiSettingsClient): string {
  // Pass the timezone to the server for use when aggregating anomalies (by day / hour) for the table.
  const tzConfig = uiSettings.get('dateFormat:tz');
  const dateFormatTz = tzConfig !== 'Browser' ? tzConfig : moment.tz.guess();
  return dateFormatTz;
}

export function getFieldsByJob(mlJobService: MlJobService) {
  return mlJobService.jobs.reduce(
    (reducedFieldsByJob, job) => {
      // Add the list of distinct by, over, partition and influencer fields for each job.
      const analysisConfig = job.analysis_config;
      const influencers = analysisConfig.influencers || [];
      const fieldsForJob = (analysisConfig.detectors || [])
        .reduce((reducedfieldsForJob, detector) => {
          if (detector.partition_field_name !== undefined) {
            reducedfieldsForJob.push(detector.partition_field_name);
          }
          if (detector.over_field_name !== undefined) {
            reducedfieldsForJob.push(detector.over_field_name);
          }
          // For jobs with by and over fields, don't add the 'by' field as this
          // field will only be added to the top-level fields for record type results
          // if it also an influencer over the bucket.
          if (detector.by_field_name !== undefined && detector.over_field_name === undefined) {
            reducedfieldsForJob.push(detector.by_field_name);
          }
          return reducedfieldsForJob;
        }, [] as string[])
        .concat(influencers);

      reducedFieldsByJob[job.job_id] = uniq(fieldsForJob);
      reducedFieldsByJob['*'] = union(reducedFieldsByJob['*'], reducedFieldsByJob[job.job_id]);
      return reducedFieldsByJob;
    },
    { '*': [] } as Record<string, string[]>
  );
}

export function getSelectionTimeRange(
  selectedCells: AppStateSelectedCells | undefined | null,
  bounds: TimeRangeBounds
): SelectionTimeRange {
  // Returns the time range of the cell(s) currently selected in the swimlane.
  // If no cell(s) are currently selected, returns the dashboard time range.

  // TODO check why this code always expect both min and max defined.
  const requiredBounds = bounds as Required<TimeRangeBounds>;

  let earliestMs = requiredBounds.min.valueOf();
  let latestMs = requiredBounds.max.valueOf();

  if (selectedCells?.times !== undefined) {
    // time property of the cell data is an array, with the elements being
    // the start times of the first and last cell selected.
    earliestMs =
      selectedCells.times[0] !== undefined
        ? selectedCells.times[0] * 1000
        : requiredBounds.min.valueOf();
    latestMs = requiredBounds.max.valueOf();
    if (selectedCells.times[1] !== undefined) {
      // Subtract 1 ms so search does not include start of next bucket.
      latestMs = selectedCells.times[1] * 1000 - 1;
    }
  }

  return { earliestMs, latestMs };
}

export function getSelectionInfluencers(
  selectedCells: AppStateSelectedCells | undefined | null,
  fieldName: string
): MlEntityField[] {
  if (
    !!selectedCells &&
    selectedCells.type !== SWIMLANE_TYPE.OVERALL &&
    selectedCells.viewByFieldName !== undefined &&
    selectedCells.viewByFieldName !== VIEW_BY_JOB_LABEL
  ) {
    return selectedCells.lanes.map((laneLabel) => ({ fieldName, fieldValue: laneLabel }));
  }

  return [];
}

export function getSelectionJobIds(
  selectedCells: AppStateSelectedCells | undefined | null,
  selectedJobs: ExplorerJob[]
): string[] {
  if (
    !!selectedCells &&
    selectedCells.type !== SWIMLANE_TYPE.OVERALL &&
    selectedCells.viewByFieldName !== undefined &&
    selectedCells.viewByFieldName === VIEW_BY_JOB_LABEL
  ) {
    return selectedCells.lanes;
  }

  return selectedJobs.map((d) => d.id);
}

export function loadAnnotationsTableData(
  mlApi: MlApi,
  selectedCells: AppStateSelectedCells | undefined | null,
  selectedJobs: ExplorerJob[],
  bounds: Required<TimeRangeBounds>
): Promise<AnnotationsTable> {
  const jobIds = getSelectionJobIds(selectedCells, selectedJobs);
  const timeRange = getSelectionTimeRange(selectedCells, bounds);

  return new Promise((resolve) => {
    lastValueFrom(
      mlApi.annotations.getAnnotations$({
        jobIds,
        earliestMs: timeRange.earliestMs,
        latestMs: timeRange.latestMs,
        maxAnnotations: ANNOTATIONS_TABLE_DEFAULT_QUERY_SIZE,
      })
    )
      .then((resp) => {
        if (resp.error !== undefined || resp.annotations === undefined) {
          const errorMessage = extractErrorMessage(resp.error);
          return resolve({
            annotationsData: [],
            totalCount: 0,
            error: errorMessage !== '' ? errorMessage : undefined,
          });
        }

        const annotationsData: Annotations = [];
        jobIds.forEach((jobId) => {
          const jobAnnotations = resp.annotations[jobId];
          if (jobAnnotations !== undefined) {
            annotationsData.push(...jobAnnotations);
          }
        });

        return resolve({
          annotationsData: annotationsData
            .sort((a, b) => {
              return a.timestamp - b.timestamp;
            })
            .map((d, i) => {
              d.key = (i + 1).toString();
              return d;
            }),
          totalCount: resp.totalCount,
        });
      })
      .catch((resp) => {
        const errorMessage = extractErrorMessage(resp);
        return resolve({
          annotationsData: [],
          totalCount: 0,
          error: errorMessage !== '' ? errorMessage : undefined,
        });
      });
  });
}

export async function loadAnomaliesTableData(
  mlApi: MlApi,
  mlJobService: MlJobService,
  selectedCells: AppStateSelectedCells | undefined | null,
  selectedJobs: ExplorerJob[],
  dateFormatTz: string,
  bounds: Required<TimeRangeBounds>,
  fieldName: string,
  tableInterval: string,
  tableSeverity: TableSeverityState,
  influencersFilterQuery?: InfluencersFilterQuery
): Promise<AnomaliesTableData> {
  const jobIds = getSelectionJobIds(selectedCells, selectedJobs);

  const influencers = getSelectionInfluencers(selectedCells, fieldName);
  const timeRange = getSelectionTimeRange(selectedCells, bounds);

  return new Promise((resolve, reject) => {
    mlApi.results
      .getAnomaliesTableData(
        jobIds,
        [],
        influencers,
        tableInterval,
        tableSeverity.val,
        timeRange.earliestMs,
        timeRange.latestMs,
        dateFormatTz,
        ANOMALIES_TABLE_DEFAULT_QUERY_SIZE,
        MAX_CATEGORY_EXAMPLES,
        influencersFilterQuery
      )
      .toPromise()
      .then((resp) => {
        if (!resp) return null;

        const detectorsByJob = mlJobService.detectorsByJob;

        const anomalies = resp.anomalies.map((anomaly) => {
          // Add a detector property to each anomaly.
          // Default to functionDescription if no description available.
          // TODO - when job_service is moved server_side, move this to server endpoint.
          const jobId = anomaly.jobId;
          const detector = get(detectorsByJob, [jobId, anomaly.detectorIndex]);

          const extendedAnomaly = { ...anomaly } as MlAnomaliesTableRecordExtended;

          extendedAnomaly.detector = get(
            detector,
            ['detector_description'],
            anomaly.source.function_description
          );

          // For detectors with rules, add a property with the rule count.
          if (detector !== undefined && detector.custom_rules !== undefined) {
            extendedAnomaly.rulesLength = detector.custom_rules.length;
          }

          // Add properties used for building the links menu.
          // TODO - when job_service is moved server_side, move this to server endpoint.
          const job = mlJobService.getJob(jobId);
          let isChartable = isSourceDataChartableForDetector(job, anomaly.detectorIndex);
          if (
            isChartable === false &&
            isModelPlotChartableForDetector(job, anomaly.detectorIndex)
          ) {
            // Check if model plot is enabled for this job.
            // Need to check the entity fields for the record in case the model plot config has a terms list.
            // If terms is specified, model plot is only stored if both the partition and by fields appear in the list.
            const entityFields = getEntityFieldList(anomaly.source);
            isChartable = isModelPlotEnabled(job, anomaly.detectorIndex, entityFields);
          }

          extendedAnomaly.isTimeSeriesViewRecord = isChartable;

          extendedAnomaly.isGeoRecord =
            detector !== undefined && detector.function === ML_JOB_AGGREGATION.LAT_LONG;

          if (mlJobService.customUrlsByJob[jobId] !== undefined) {
            extendedAnomaly.customUrls = mlJobService.customUrlsByJob[jobId];
          }

          return extendedAnomaly;
        });

        resolve({
          anomalies,
          interval: resp.interval,
          examplesByJobId: resp.examplesByJobId ?? {},
          showViewSeriesLink: true,
          jobIds,
        });
      })
      .catch((resp) => {
        // eslint-disable-next-line no-console
        console.log('Explorer - error loading data for anomalies table:', resp);
        reject();
      });
  });
}

// Recommended by MDN for escaping user input to be treated as a literal string within a regular expression
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

export function escapeParens(string: string): string {
  return string.replace(/[()]/g, '\\$&');
}

export function escapeDoubleQuotes(string: string): string {
  return string.replace(/[\\"]/g, '\\$&');
}

export function getQueryPattern(fieldName: string, fieldValue: string) {
  const sanitizedFieldName = escapeRegExp(fieldName);
  const sanitizedFieldValue = escapeRegExp(fieldValue);

  return new RegExp(`(${sanitizedFieldName})\\s?:\\s?(")?(${sanitizedFieldValue})(")?`, 'i');
}

export function removeFilterFromQueryString(
  currentQueryString: string,
  fieldName: string,
  fieldValue: string
) {
  let newQueryString = '';
  // Remove the passed in fieldName and value from the existing filter
  const queryPattern = getQueryPattern(fieldName, fieldValue);
  newQueryString = currentQueryString.replace(queryPattern, '');
  // match 'and' or 'or' at the start/end of the string
  const endPattern = /\s(and|or)\s*$/gi;
  const startPattern = /^\s*(and|or)\s/gi;
  // If string has a double operator (e.g. tag:thing or or tag:other) remove and replace with the first occurring operator
  const invalidOperatorPattern = /\s+(and|or)\s+(and|or)\s+/gi;
  newQueryString = newQueryString.replace(invalidOperatorPattern, ' $1 ');
  // If string starts/ends with 'and' or 'or' remove that as that is illegal kuery syntax
  newQueryString = newQueryString.replace(endPattern, '');
  newQueryString = newQueryString.replace(startPattern, '');

  return newQueryString;
}

// Returns an object mapping job ids to source indices which map to geo fields for that index
export async function getDataViewsAndIndicesWithGeoFields(
  selectedJobs: Array<CombinedJob | ExplorerJob>,
  dataViewsService: DataViewsContract,
  mlIndexUtils: MlIndexUtils
): Promise<{ sourceIndicesWithGeoFieldsMap: SourceIndicesWithGeoFields; dataViews: DataView[] }> {
  const sourceIndicesWithGeoFieldsMap: SourceIndicesWithGeoFields = {};
  // Avoid searching for data view again if previous job already has same source index
  const dataViewsMap = new Map<string, DataView>();
  // Go through selected jobs
  if (Array.isArray(selectedJobs)) {
    for (const job of selectedJobs) {
      let sourceIndices;
      let jobId: string;
      if (isExplorerJob(job)) {
        sourceIndices = job.sourceIndices;
        jobId = job.id;
      } else {
        sourceIndices = job.datafeed_config.indices;
        jobId = job.job_id;
      }

      if (Array.isArray(sourceIndices)) {
        for (const sourceIndex of sourceIndices) {
          const cachedDV = dataViewsMap.get(sourceIndex);
          const dataViewId =
            cachedDV?.id ?? (await mlIndexUtils.getDataViewIdFromName(sourceIndex));

          if (dataViewId) {
            const dataView = cachedDV ?? (await dataViewsService.get(dataViewId));

            if (!dataView) {
              continue;
            }
            dataViewsMap.set(sourceIndex, dataView);

            const geoFields = [
              ...dataView.fields.getByType(ES_FIELD_TYPES.GEO_POINT),
              ...dataView.fields.getByType(ES_FIELD_TYPES.GEO_SHAPE),
            ];
            if (geoFields.length > 0) {
              if (sourceIndicesWithGeoFieldsMap[jobId] === undefined) {
                sourceIndicesWithGeoFieldsMap[jobId] = {
                  [sourceIndex]: { geoFields: [], dataViewId },
                };
              }
              sourceIndicesWithGeoFieldsMap[jobId][sourceIndex].geoFields.push(
                ...geoFields.map((field) => field.name)
              );
            }
          }
        }
      }
    }
  }
  return { sourceIndicesWithGeoFieldsMap, dataViews: [...dataViewsMap.values()] };
}

// Creates index pattern in the format expected by the kuery bar/kuery autocomplete provider
// Field objects required fields: name, type, aggregatable, searchable
export function getAnomalyResultsIndexPattern(influencers: ExplorerJob[]) {
  return {
    title: ML_RESULTS_INDEX_PATTERN,
    fields: influencers.map((influencer) => ({
      name: influencer.id,
      type: 'string',
      aggregatable: true,
      searchable: true,
    })),
  };
}

// Returns a list of unique group ids and job ids
export function getMergedGroupsAndJobsIds(groups: GroupObj[], selectedJobs: ExplorerJob[]) {
  const jobIdsFromGroups = groups.flatMap((group) => group.jobIds);
  const groupIds = groups.map((group) => group.groupId);
  const uniqueJobIds = selectedJobs
    .filter((job) => !jobIdsFromGroups.includes(job.id))
    .map((job) => job.id);

  return [...groupIds, ...uniqueJobIds];
}

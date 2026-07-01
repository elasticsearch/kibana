/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject } from 'rxjs';
import { cloneDeep } from 'lodash';

import { ES_FIELD_TYPES } from '@kbn/field-types';
import type { Query } from '@kbn/es-query';
import type { DataView } from '@kbn/data-views-plugin/public';
import { addExcludeFrozenToQuery } from '@kbn/ml-query-utils';
import {
  type Aggregation,
  type Field,
  type MlUrlConfig,
  ML_JOB_AGGREGATION,
  mlJobAggregations,
  mlJobAggregationsWithoutEsEquivalent,
} from '@kbn/ml-anomaly-utils';
import type { RuntimeMappings } from '@kbn/ml-runtime-field-utils';
import type { SavedSearch } from '@kbn/saved-search-plugin/public';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { parseInterval } from '@kbn/ml-parse-interval';

import type { IndexPatternTitle } from '@kbn/ml-common-types/kibana';
import type { Datafeed, DatafeedId } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type {
  Job,
  Detector,
  JobId,
  BucketSpan,
  CustomSettings,
} from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { MlCalendar } from '@kbn/ml-common-types/calendars';
import { createDatafeedId } from '../../../../../../common/util/job_utils';
import type { MlApi } from '../../../../services/ml_api_service';
import { getQueryFromSavedSearchObject } from '../../../../util/index_utils';
import { combineFieldsAndAggs } from '../../../../../../common/util/fields_utils';
import { createEmptyJob, createEmptyDatafeed } from './util/default_configs';
import { JobRunner, type ProgressSubscriber } from '../job_runner';
import type { CREATED_BY_LABEL } from '../../../../../../common/constants/new_job';
import { JOB_TYPE, SHARED_RESULTS_INDEX_NAME } from '../../../../../../common/constants/new_job';
import { collectAggs } from './util/general';
import { filterRuntimeMappings } from './util/filter_runtime_mappings';
import { mlCalendarService } from '../../../../services/calendar_service';
import { getDatafeedAggregations } from '../../../../../../common/util/datafeed_utils';
import { getFirstKeyInObject } from '../../../../../../common/util/object_utils';
import type { NewJobCapsService } from '../../../../services/new_job_capabilities/new_job_capabilities_service';

export class JobCreator {
  protected _type: JOB_TYPE = JOB_TYPE.SINGLE_METRIC;
  protected _indexPattern: DataView;
  protected _savedSearch: SavedSearch | null;
  protected _indexPatternTitle: IndexPatternTitle = '';
  protected _indexPatternDisplayName: string = '';
  protected _job_config: Job;
  protected _calendars: MlCalendar[];
  protected _datafeed_config: Datafeed;
  protected _detectors: Detector[];
  protected _influencers: string[];
  protected _bucketSpanMs: number = 0;
  protected _useDedicatedIndex: boolean = false;
  protected _start: number = 0;
  protected _end: number = 0;
  protected _subscribers: ProgressSubscriber[] = [];
  protected _aggs: Aggregation[] = [];
  protected _fields: Field[] = [];
  protected _scriptFields: Field[] = [];
  protected _runtimeFields: Field[] = [];
  protected _runtimeMappings: RuntimeMappings | null = null;
  protected _filterRuntimeMappingsOnSave: boolean = true;
  protected _aggregationFields: Field[] = [];
  protected _sparseData: boolean = false;
  private _stopAllRefreshPolls: {
    stop: boolean;
  } = { stop: false };

  protected _wizardInitialized$ = new BehaviorSubject<boolean>(false);
  public wizardInitialized$ = this._wizardInitialized$.asObservable();
  public mlApi: MlApi;
  public newJobCapsService: NewJobCapsService;

  constructor(
    mlApi: MlApi,
    newJobCapsService: NewJobCapsService,
    indexPattern: DataView,
    savedSearch: SavedSearch | null,
    query: object
  ) {
    this.mlApi = mlApi;
    this.newJobCapsService = newJobCapsService;
    this._indexPattern = indexPattern;
    this._savedSearch = savedSearch;

    const title = this._indexPattern.title;
    const name = this._indexPattern.getName();
    this._indexPatternDisplayName = name === title ? name : `${name} (${title})`;
    this._indexPatternTitle = title;

    this._job_config = createEmptyJob();
    this._calendars = [];
    this._datafeed_config = createEmptyDatafeed(this._indexPatternTitle);
    this._detectors = this._job_config.analysis_config.detectors;
    this._influencers = this._job_config.analysis_config.influencers!;

    if (typeof indexPattern.timeFieldName === 'string') {
      this._job_config.data_description.time_field = indexPattern.timeFieldName;
    }

    this._extractRuntimeMappings();

    this._datafeed_config.query = query;
  }

  public get type(): JOB_TYPE {
    return this._type;
  }

  public get savedSearch(): SavedSearch | null {
    return this._savedSearch;
  }

  public get dataView(): DataView {
    return this._indexPattern;
  }

  public get dataViewId(): string | undefined {
    return this._indexPattern.id;
  }

  public get indexPatternTitle(): string {
    return this._indexPatternTitle;
  }

  public get indexPatternDisplayName(): string {
    return this._indexPatternDisplayName;
  }

  protected _addDetector(detector: Detector, agg: Aggregation, field: Field) {
    this._detectors.push(detector);
    this._aggs.push(agg);
    this._fields.push(field);
    this._updateSparseDataDetectors();
  }

  protected _editDetector(detector: Detector, agg: Aggregation, field: Field, index: number) {
    if (this._detectors[index] !== undefined) {
      this._detectors[index] = detector;
      this._aggs[index] = agg;
      this._fields[index] = field;
      this._updateSparseDataDetectors();
    }
  }

  protected _removeDetector(index: number) {
    this._detectors.splice(index, 1);
    this._aggs.splice(index, 1);
    this._fields.splice(index, 1);
  }

  public removeAllDetectors() {
    this._detectors.length = 0;
    this._aggs.length = 0;
    this._fields.length = 0;
  }

  public get savedSearchQuery(): { query: Query; filter: any[] } | null {
    return this._savedSearch ? getQueryFromSavedSearchObject(this._savedSearch) : null;
  }

  public get detectors(): Detector[] {
    return this._detectors;
  }

  public get aggregationsInDetectors(): Aggregation[] {
    return this._aggs;
  }

  public getAggregation(index: number): Aggregation | null {
    const agg = this._aggs[index];
    return agg !== undefined ? agg : null;
  }

  public get aggregations(): Aggregation[] {
    return this._aggs;
  }

  public getField(index: number): Field | null {
    const field = this._fields[index];
    return field !== undefined ? field : null;
  }

  public get fields(): Field[] {
    return this._fields;
  }

  public set bucketSpan(bucketSpan: BucketSpan) {
    this._job_config.analysis_config.bucket_span = bucketSpan;
    this._setBucketSpanMs(bucketSpan);
  }

  public get bucketSpan(): BucketSpan {
    return this._job_config.analysis_config.bucket_span!;
  }

  protected _setBucketSpanMs(bucketSpan: BucketSpan) {
    const bs = parseInterval(bucketSpan, true);
    this._bucketSpanMs = bs === null ? 0 : bs.asMilliseconds();
  }

  public get bucketSpanMs(): number {
    return this._bucketSpanMs;
  }

  public addInfluencer(influencer: string) {
    if (this._influencers.includes(influencer) === false) {
      this._influencers.push(influencer);
    }
  }

  public removeInfluencer(influencer: string) {
    const idx = this._influencers.indexOf(influencer);
    if (idx !== -1) {
      this._influencers.splice(idx, 1);
    }
  }

  public removeAllInfluencers() {
    this._influencers.length = 0;
  }

  public get influencers(): string[] {
    return this._influencers;
  }

  public set jobId(jobId: JobId) {
    this._job_config.job_id = jobId;
    this._datafeed_config.job_id = jobId;
    this._datafeed_config.datafeed_id = createDatafeedId(jobId);

    if (this._useDedicatedIndex) {
      this._job_config.results_index_name = jobId;
    }
  }

  public get jobId(): JobId {
    return this._job_config.job_id;
  }

  public get datafeedId(): DatafeedId {
    return this._datafeed_config.datafeed_id;
  }

  public set description(description: string) {
    this._job_config.description = description;
  }

  public get description(): string {
    return this._job_config.description ?? '';
  }

  public get groups(): string[] {
    return this._job_config.groups ?? [];
  }

  public set groups(groups: string[]) {
    this._job_config.groups = groups;
  }

  public get calendars(): MlCalendar[] {
    return this._calendars;
  }

  public set calendars(calendars: MlCalendar[]) {
    this._calendars = calendars;
  }

  private _initModelPlotConfig() {
    // initialize configs to false if they are missing
    if (this._job_config.model_plot_config === undefined) {
      this._job_config.model_plot_config = {
        enabled: false,
      };
    }
    if (
      this._job_config.model_plot_config !== undefined &&
      this._job_config.model_plot_config.enabled === undefined
    ) {
      this._job_config.model_plot_config.enabled = false;
    }
    if (
      this._job_config.model_plot_config !== undefined &&
      this._job_config.model_plot_config.annotations_enabled === undefined
    ) {
      this._job_config.model_plot_config.annotations_enabled = false;
    }
  }

  public set modelPlot(enable: boolean) {
    this._initModelPlotConfig();
    this._job_config.model_plot_config!.enabled = enable;
  }

  public get modelPlot() {
    return (
      this._job_config.model_plot_config !== undefined &&
      this._job_config.model_plot_config.enabled === true
    );
  }

  public set modelChangeAnnotations(enable: boolean) {
    this._initModelPlotConfig();
    this._job_config.model_plot_config!.annotations_enabled = enable;
  }

  public get modelChangeAnnotations() {
    return this._job_config.model_plot_config?.annotations_enabled === true;
  }

  public set useDedicatedIndex(enable: boolean) {
    this._useDedicatedIndex = enable;
    if (enable) {
      if (this._job_config.results_index_name === undefined) {
        // only set the results_index_name if it hasn't been set before.
        // this allows it to be overwritten in the advanced JSON editor.
        this._job_config.results_index_name = this._job_config.job_id;
      }
    } else {
      // @ts-expect-error The operand of a 'delete' operator must be optional
      delete this._job_config.results_index_name;
    }
  }

  public get useDedicatedIndex(): boolean {
    return this._useDedicatedIndex;
  }

  public set modelMemoryLimit(mml: string | null) {
    if (mml !== null) {
      if (this._job_config.analysis_limits === undefined) {
        this._job_config.analysis_limits = {};
      }
      this._job_config.analysis_limits.model_memory_limit = mml;
    } else {
      if (this._job_config.analysis_limits !== undefined) {
        delete this._job_config.analysis_limits.model_memory_limit;

        if (isPopulatedObject(this._job_config.analysis_limits) === false) {
          delete this._job_config.analysis_limits;
        }
      }
    }
  }

  public get modelMemoryLimit(): string | null {
    if (
      this._job_config.analysis_limits &&
      this._job_config.analysis_limits.model_memory_limit !== undefined
    ) {
      return this._job_config.analysis_limits.model_memory_limit as string;
    } else {
      return null;
    }
  }

  public set summaryCountFieldName(fieldName: string | null) {
    if (fieldName !== null) {
      this._job_config.analysis_config.summary_count_field_name = fieldName;
    } else {
      delete this._job_config.analysis_config.summary_count_field_name;
    }
  }

  public get summaryCountFieldName(): string | null {
    return this._job_config.analysis_config.summary_count_field_name || null;
  }

  public set categorizationFieldName(fieldName: string | null) {
    if (fieldName !== null) {
      this._job_config.analysis_config.categorization_field_name = fieldName;
    } else {
      delete this._job_config.analysis_config.categorization_field_name;
    }
  }

  public get categorizationFieldName(): string | null {
    return this._job_config.analysis_config.categorization_field_name || null;
  }

  public addCategorizationFilter(filter: string) {
    if (this._job_config.analysis_config.categorization_filters === undefined) {
      this._job_config.analysis_config.categorization_filters = [];
    }

    const filters = this._job_config.analysis_config.categorization_filters;
    if (filters.includes(filter) === false) {
      filters.push(filter);
    }
  }

  public removeCategorizationFilter(filter: string) {
    const filters = this._job_config.analysis_config.categorization_filters;
    if (filters !== undefined) {
      const idx = filters.indexOf(filter);
      if (idx !== -1) {
        filters.splice(idx, 1);
      }
      if (filters.length === 0) {
        this.removeCategorizationFilters();
      }
    }
  }

  public removeCategorizationFilters() {
    delete this._job_config.analysis_config.categorization_filters;
  }

  public get categorizationFilters(): string[] | null {
    return this._job_config.analysis_config.categorization_filters || null;
  }

  public get timeFieldName(): string {
    return this._job_config.data_description.time_field!;
  }

  public set timeFieldName(fieldName: string) {
    this._job_config.data_description.time_field = fieldName;
  }

  public get sparseData(): boolean {
    return this._sparseData;
  }

  public set sparseData(sparseData: boolean) {
    this._sparseData = sparseData;
    this._updateSparseDataDetectors();
  }

  private _updateSparseDataDetectors() {
    // loop through each detector, if the aggregation in the corresponding detector index is a count or sum
    // change the detector to be a non-zer or non-null count or sum.
    // note, the aggregations will always be a standard count or sum and not a non-null or non-zero version
    this._detectors.forEach((d, i) => {
      if (this._aggs[i] === undefined) {
        return;
      }
      switch (this._aggs[i].id) {
        case ML_JOB_AGGREGATION.COUNT:
          d.function = this._sparseData
            ? ML_JOB_AGGREGATION.NON_ZERO_COUNT
            : ML_JOB_AGGREGATION.COUNT;
          break;
        case ML_JOB_AGGREGATION.HIGH_COUNT:
          d.function = this._sparseData
            ? ML_JOB_AGGREGATION.HIGH_NON_ZERO_COUNT
            : ML_JOB_AGGREGATION.HIGH_COUNT;
          break;
        case ML_JOB_AGGREGATION.LOW_COUNT:
          d.function = this._sparseData
            ? ML_JOB_AGGREGATION.LOW_NON_ZERO_COUNT
            : ML_JOB_AGGREGATION.LOW_COUNT;
          break;
        case ML_JOB_AGGREGATION.SUM:
          d.function = this._sparseData ? ML_JOB_AGGREGATION.NON_NULL_SUM : ML_JOB_AGGREGATION.SUM;
          break;
        case ML_JOB_AGGREGATION.HIGH_SUM:
          d.function = this._sparseData
            ? ML_JOB_AGGREGATION.HIGH_NON_NULL_SUM
            : ML_JOB_AGGREGATION.HIGH_SUM;
          break;
        case ML_JOB_AGGREGATION.LOW_SUM:
          d.function = this._sparseData
            ? ML_JOB_AGGREGATION.LOW_NON_NULL_SUM
            : ML_JOB_AGGREGATION.LOW_SUM;
          break;
      }
    });
  }

  /**
   * Extends assigned calendars with created job id.
   * @internal
   */
  private async _updateCalendars() {
    if (this._calendars.length === 0) {
      return;
    }

    for (const calendar of this._calendars) {
      await mlCalendarService.assignNewJobId(this.mlApi, calendar, this.jobId);
    }
  }

  public setTimeRange(start: number, end: number) {
    this._start = start;
    this._end = end;
  }

  public get start(): number {
    return this._start;
  }

  public get end(): number {
    return this._end;
  }

  public get query(): object {
    return this._datafeed_config.query!;
  }

  public set query(query: object) {
    this._datafeed_config.query = query;
  }

  public get queryDelay(): string | null {
    // @ts-expect-error `estypes.Duration = string | -1 | 0;`
    return this._datafeed_config.query_delay || null;
  }

  public set queryDelay(queryDelay: string | null) {
    if (queryDelay !== null) {
      this._datafeed_config.query_delay = queryDelay;
    } else {
      delete this._datafeed_config.query_delay;
    }
  }

  public get frequency(): string | null {
    // @ts-expect-error `estypes.Duration = string | -1 | 0;`
    return this._datafeed_config.frequency || null;
  }

  public set frequency(frequency: string | null) {
    if (frequency !== null) {
      this._datafeed_config.frequency = frequency;
    } else {
      delete this._datafeed_config.frequency;
    }
  }

  public get scrollSize(): number | null {
    return this._datafeed_config.scroll_size || null;
  }

  public set scrollSize(scrollSize: number | null) {
    if (scrollSize !== null) {
      this._datafeed_config.scroll_size = scrollSize;
    } else {
      delete this._datafeed_config.scroll_size;
    }
  }

  public set projectRouting(projectRouting: string | null) {
    if (projectRouting !== null) {
      this._datafeed_config.project_routing = projectRouting;
    } else {
      delete this._datafeed_config.project_routing;
    }
  }

  public get projectRouting(): string | null {
    return this._datafeed_config.project_routing ?? null;
  }

  public get indices(): string[] {
    return this._datafeed_config.indices;
  }

  public set indices(indics: string[]) {
    this._datafeed_config.indices = indics;
  }

  public get ignoreUnavailable(): boolean {
    return !!this._datafeed_config.indices_options?.ignore_unavailable;
  }

  public set ignoreUnavailable(ignore: boolean) {
    if (ignore === true) {
      if (this._datafeed_config.indices_options === undefined) {
        this._datafeed_config.indices_options = {};
      }
      this._datafeed_config.indices_options.ignore_unavailable = true;
    } else {
      if (this._datafeed_config.indices_options !== undefined) {
        delete this._datafeed_config.indices_options.ignore_unavailable;

        // if no other properties are set, remove indices_options
        if (Object.keys(this._datafeed_config.indices_options).length === 0) {
          delete this._datafeed_config.indices_options;
        }
      }
    }
  }

  public get scriptFields(): Field[] {
    return this._scriptFields;
  }

  public get runtimeMappings(): RuntimeMappings | null {
    return this._runtimeMappings;
  }

  public get runtimeFields(): Field[] {
    return this._runtimeFields;
  }

  public get aggregationFields(): Field[] {
    return this._aggregationFields;
  }

  public get additionalFields(): Field[] {
    return [...this._scriptFields, ...this._runtimeFields, ...this._aggregationFields];
  }

  public get subscribers(): ProgressSubscriber[] {
    return this._subscribers;
  }

  public async createAndStartJob(): Promise<JobRunner> {
    try {
      await this.createJob();
      await this.createDatafeed();
      const jobRunner = await this.startDatafeed();
      return jobRunner;
    } catch (error) {
      throw error;
    }
  }

  public async createJob() {
    try {
      await this.mlApi.addJob({
        jobId: this._job_config.job_id,
        job: this._job_config,
      });
      await this._updateCalendars();
    } catch (error) {
      throw error;
    }
  }

  public async createDatafeed(): Promise<object> {
    try {
      const tempDatafeed = this._getDatafeedWithFilteredRuntimeMappings();
      const jobId = this._job_config.job_id;
      const datafeedId = createDatafeedId(jobId);
      tempDatafeed.job_id = jobId;

      return this.mlApi.addDatafeed({
        datafeedId,
        datafeedConfig: tempDatafeed,
      });
    } catch (error) {
      throw error;
    }
  }

  // create a jobRunner instance, start it and return it
  public async startDatafeed(): Promise<JobRunner> {
    const jobRunner = new JobRunner(this);
    await jobRunner.startDatafeed();
    return jobRunner;
  }

  private _getDatafeedWithFilteredRuntimeMappings(): Datafeed {
    if (this._filterRuntimeMappingsOnSave === false) {
      return this._datafeed_config;
    }

    const { runtime_mappings: filteredRuntimeMappings } = filterRuntimeMappings(
      this._job_config,
      this._datafeed_config
    );

    return {
      ...this._datafeed_config,
      runtime_mappings:
        Object.keys(filteredRuntimeMappings).length > 0 ? filteredRuntimeMappings : undefined,
    };
  }

  public subscribeToProgress(func: ProgressSubscriber) {
    this._subscribers.push(func);
  }

  public get jobConfig(): Job {
    return this._job_config;
  }

  public get datafeedConfig(): Datafeed {
    return this._datafeed_config;
  }

  public get stopAllRefreshPolls(): { stop: boolean } {
    return this._stopAllRefreshPolls;
  }

  public forceStopRefreshPolls() {
    this._stopAllRefreshPolls.stop = true;
  }

  private _setCustomSetting(
    setting: keyof CustomSettings,
    value: CustomSettings[keyof CustomSettings] | null
  ) {
    if (value === null) {
      // if null is passed in, delete the custom setting
      if (
        this._job_config.custom_settings !== undefined &&
        this._job_config.custom_settings[setting] !== undefined
      ) {
        delete this._job_config.custom_settings[setting];

        if (Object.keys(this._job_config.custom_settings).length === 0) {
          // clean up custom_settings if there's nothing else in there
          delete this._job_config.custom_settings;
        }
      }
    } else {
      if (this._job_config.custom_settings === undefined) {
        // if custom_settings doesn't exist, create it.
        this._job_config.custom_settings = {
          [setting]: value,
        };
      } else {
        // @ts-ignore
        this._job_config.custom_settings[setting] = value;
      }
    }
  }

  private _getCustomSetting(
    setting: keyof CustomSettings
  ): CustomSettings[keyof CustomSettings] | null {
    if (
      this._job_config.custom_settings !== undefined &&
      this._job_config.custom_settings[setting] !== undefined
    ) {
      return this._job_config.custom_settings[setting];
    }
    return null;
  }

  public set createdBy(createdBy: CREATED_BY_LABEL | null) {
    this._setCustomSetting('created_by', createdBy);
  }

  public get createdBy(): CREATED_BY_LABEL | null {
    return this._getCustomSetting('created_by') as CREATED_BY_LABEL | null;
  }

  public set customUrls(customUrls: MlUrlConfig[] | null) {
    this._setCustomSetting('custom_urls', customUrls);
  }

  public get customUrls(): MlUrlConfig[] | null {
    return this._getCustomSetting('custom_urls') as MlUrlConfig[] | null;
  }

  public get formattedJobJson() {
    return JSON.stringify(this._job_config, null, 2);
  }

  public get formattedDatafeedJson() {
    return JSON.stringify(this._datafeed_config, null, 2);
  }

  public set filterRuntimeMappingsOnSave(filter: boolean) {
    this._filterRuntimeMappingsOnSave = filter;
  }

  public get filterRuntimeMappingsOnSave(): boolean {
    return this._filterRuntimeMappingsOnSave;
  }

  protected _initPerPartitionCategorization() {
    if (this._job_config.analysis_config.per_partition_categorization === undefined) {
      this._job_config.analysis_config.per_partition_categorization = {};
    }
    if (this._job_config.analysis_config.per_partition_categorization?.enabled === undefined) {
      this._job_config.analysis_config.per_partition_categorization!.enabled = false;
    }
    if (this._job_config.analysis_config.per_partition_categorization?.stop_on_warn === undefined) {
      this._job_config.analysis_config.per_partition_categorization!.stop_on_warn = false;
    }
  }

  public get perPartitionCategorization() {
    return this._job_config.analysis_config.per_partition_categorization?.enabled === true;
  }

  public set perPartitionCategorization(enabled: boolean) {
    this._initPerPartitionCategorization();
    this._job_config.analysis_config.per_partition_categorization!.enabled = enabled;
  }

  public get perPartitionStopOnWarn() {
    return this._job_config.analysis_config.per_partition_categorization?.stop_on_warn === true;
  }

  public set perPartitionStopOnWarn(enabled: boolean) {
    this._initPerPartitionCategorization();
    this._job_config.analysis_config.per_partition_categorization!.stop_on_warn = enabled;
  }

  private _extractRuntimeMappings() {
    const runtimeFieldMap = this._indexPattern.toSpec().runtimeFieldMap as
      | RuntimeMappings
      | undefined;
    if (runtimeFieldMap !== undefined) {
      if (this._datafeed_config.runtime_mappings === undefined) {
        this._datafeed_config.runtime_mappings = {};
      }
      Object.entries(runtimeFieldMap).forEach(([key, val]) => {
        this._datafeed_config.runtime_mappings![key] = val;
      });
    }
    this._populateRuntimeFields();
  }

  private _populateRuntimeFields() {
    this._runtimeFields = [];
    this._runtimeMappings = this._datafeed_config.runtime_mappings ?? null;
    if (this._runtimeMappings !== null) {
      const tempRuntimeFields = Object.entries(this._runtimeMappings).map(
        ([id, runtimeField]) =>
          ({
            id,
            name: id,
            type: Array.isArray(runtimeField) ? runtimeField[0].type : runtimeField.type,
            aggregatable: true,
            counter: false,
            aggs: [],
            runtimeField,
          } as Field)
      );

      const aggs = cloneDeep([...mlJobAggregations, ...mlJobAggregationsWithoutEsEquivalent]);
      this._runtimeFields = combineFieldsAndAggs(tempRuntimeFields, aggs, {}).fields;
    }
  }

  private _populateScriptFields() {
    this._scriptFields = [];
    if (this._datafeed_config.script_fields !== undefined) {
      this._scriptFields = Object.keys(this._datafeed_config.script_fields).map((f) => ({
        id: f,
        name: f,
        type: ES_FIELD_TYPES.KEYWORD,
        aggregatable: true,
        counter: false,
      }));
    }
  }

  // load the start and end times for the selected index
  // and apply them to the job creator
  public async autoSetTimeRange(excludeFrozenData = true) {
    const { start, end } = await this.mlApi.getTimeFieldRange({
      index: this._indexPatternTitle,
      timeFieldName: this.timeFieldName,
      query: excludeFrozenData ? addExcludeFrozenToQuery(this.query) : this.query,
      runtimeMappings: this.datafeedConfig.runtime_mappings,
      indicesOptions: this.datafeedConfig.indices_options,
      projectRouting: this.projectRouting ?? undefined,
    });

    this.setTimeRange(start, end);
  }

  protected _overrideConfigs(job: Job, datafeed: Datafeed) {
    this._job_config = job;
    this._datafeed_config = datafeed;

    this._detectors = this._job_config.analysis_config.detectors;
    this._influencers = this._job_config.analysis_config.influencers!;

    if (this._job_config.groups === undefined) {
      this._job_config.groups = [];
    }

    if (this._job_config.analysis_config.influencers !== undefined) {
      this._job_config.analysis_config.influencers.forEach((i) => this.addInfluencer(i));
    }

    if (
      this._job_config.results_index_name !== undefined &&
      this._job_config.results_index_name !== SHARED_RESULTS_INDEX_NAME
    ) {
      this.useDedicatedIndex = true;
    }

    this._populateScriptFields();
    this._populateRuntimeFields();

    this._aggregationFields = [];
    const aggs = getDatafeedAggregations(this._datafeed_config);
    if (aggs !== undefined) {
      const aggBucketsName = getFirstKeyInObject(aggs);
      if (aggBucketsName !== undefined && aggs[aggBucketsName] !== undefined) {
        const buckets = aggs[aggBucketsName];
        collectAggs(buckets, this._aggregationFields);
      }
    }
  }
}

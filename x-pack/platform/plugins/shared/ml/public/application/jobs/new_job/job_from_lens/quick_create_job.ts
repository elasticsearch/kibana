/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type {
  ChartInfo,
  LensPublicStart,
  LensSavedObjectAttributes,
} from '@kbn/lens-plugin/public';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import { isOfAggregateQueryType, type Filter, type Query } from '@kbn/es-query';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { LensApi } from '@kbn/lens-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { JobCreatorType } from '../common/job_creator';
import { createEmptyJob, createEmptyDatafeed } from '../common/job_creator/util/default_configs';
import type { MlApi } from '../../../services/ml_api_service';
import {
  CREATED_BY_LABEL,
  DEFAULT_BUCKET_SPAN,
  JOB_TYPE,
} from '../../../../../common/constants/new_job';
import {
  isCompatibleLayer,
  createDetectors,
  getJobsItemsFromEmbeddable,
  getChartInfoFromVisualization,
} from './utils';
import { VisualizationExtractor } from './visualization_extractor';
import { QuickJobCreatorBase, type CreateState } from '../job_from_dashboard';
import { jobCloningService } from '../../../services/job_cloning_service';

export class QuickLensJobCreator extends QuickJobCreatorBase {
  constructor(
    private readonly lens: LensPublicStart,
    dataViews: DataViewsContract,
    kibanaConfig: IUiSettingsClient,
    timeFilter: TimefilterContract,
    share: SharePluginStart,
    mlApi: MlApi,
    cps?: CPSPluginStart
  ) {
    super(dataViews, kibanaConfig, timeFilter, share, mlApi, cps);
  }

  public async createAndSaveJob(
    jobId: string,
    bucketSpan: string,
    embeddable: LensApi,
    startJob: boolean,
    runInRealTime: boolean,
    layerIndex: number
  ): Promise<CreateState> {
    const { query, filters, to, from, dashboard, chartInfo } = await getJobsItemsFromEmbeddable(
      embeddable,
      this.lens
    );
    if (query === undefined || filters === undefined) {
      throw new Error('Cannot create job, query and filters are undefined');
    }

    const { jobConfig, datafeedConfig, start, end, jobType } = await this.createJob(
      chartInfo!,
      from,
      to,
      query,
      filters,
      bucketSpan,
      layerIndex
    );
    const createdByLabel =
      jobType === JOB_TYPE.SINGLE_METRIC
        ? CREATED_BY_LABEL.SINGLE_METRIC_FROM_LENS
        : CREATED_BY_LABEL.MULTI_METRIC_FROM_LENS;

    const result = await this.putJobAndDataFeed({
      jobId,
      datafeedConfig,
      jobConfig,
      createdByLabel,
      dashboard,
      start,
      end,
      startJob,
      runInRealTime,
    });
    return result;
  }

  public async createAndStashADJob(
    vis: LensSavedObjectAttributes,
    startString: string,
    endString: string,
    query: Query,
    filters: Filter[],
    layerIndex: number | undefined
  ) {
    const chartInfo = await getChartInfoFromVisualization(this.lens, vis);
    try {
      const { jobConfig, datafeedConfig, jobType, start, end, includeTimeRange } =
        await this.createJob(
          chartInfo,
          startString,
          endString,
          query,
          filters,
          DEFAULT_BUCKET_SPAN,
          layerIndex
        );

      // add job config and start and end dates to the
      // job cloning stash, so they can be used
      // by the new job wizards
      jobCloningService.stashJobForCloning(
        {
          jobConfig,
          datafeedConfig,
          createdBy:
            jobType === JOB_TYPE.SINGLE_METRIC
              ? CREATED_BY_LABEL.SINGLE_METRIC
              : CREATED_BY_LABEL.MULTI_METRIC,
          start,
          end,
        } as JobCreatorType,
        true,
        includeTimeRange,
        !includeTimeRange
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
    }
  }

  private async createJob(
    chartInfo: ChartInfo,
    startString: string,
    endString: string,
    query: Query,
    filters: Filter[],
    bucketSpan: string,
    layerIndex: number | undefined
  ) {
    const { jobConfig, datafeedConfig, jobType } = await this.createADJobFromLensSavedObject(
      chartInfo,
      query,
      filters,
      bucketSpan,
      layerIndex
    );

    let start: number | undefined;
    let end: number | undefined;
    let includeTimeRange = true;

    try {
      // attempt to parse the start and end dates.
      // if start and end values cannot be determined
      // instruct the job cloning code to auto-select the
      // full time range for the index.
      const { min, max } = this.timeFilter.calculateBounds({ to: endString, from: startString });
      start = min?.valueOf();
      end = max?.valueOf();

      if (start === undefined || end === undefined || isNaN(start) || isNaN(end)) {
        throw Error(
          i18n.translate('xpack.ml.newJob.fromLens.createJob.error.timeRange', {
            defaultMessage: 'Incompatible time range',
          })
        );
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(error);
      includeTimeRange = false;
      start = undefined;
      end = undefined;
    }

    return {
      jobConfig,
      datafeedConfig,
      jobType,
      start,
      end,
      includeTimeRange,
    };
  }

  private async createADJobFromLensSavedObject(
    chartInfo: ChartInfo,
    query: Query,
    filters: Filter[],
    bucketSpan: string,
    layerIndex?: number
  ) {
    // we should not have got this far if the query is ES|QL
    // but just in case, throw an error if it is
    if (isOfAggregateQueryType(chartInfo.query)) {
      throw new Error('Cannot create job, query is of aggregate type');
    }
    const compatibleLayers = chartInfo.layers.filter(isCompatibleLayer);

    const selectedLayer =
      layerIndex !== undefined ? chartInfo.layers[layerIndex] : compatibleLayers[0];

    const visExtractor = new VisualizationExtractor();
    const { fields, timeField, splitField, dataView } = await visExtractor.extractFields(
      selectedLayer
    );

    const jobConfig = createEmptyJob();
    const datafeedConfig = createEmptyDatafeed(dataView.getIndexPattern());

    const combinedFiltersAndQueries = this.combineQueriesAndFilters(
      { query, filters },
      { query: chartInfo.query, filters: chartInfo.filters },
      dataView
    );

    datafeedConfig.query = combinedFiltersAndQueries;

    jobConfig.analysis_config.detectors = createDetectors(fields, splitField);

    jobConfig.data_description.time_field = timeField.operation.fields?.[0];
    jobConfig.analysis_config.bucket_span = bucketSpan;
    if (splitField && splitField.operation.fields) {
      jobConfig.analysis_config.influencers = [splitField.operation.fields[0]];
    }
    const isSingleMetric = !splitField && jobConfig.analysis_config.detectors.length === 1;
    const jobType = isSingleMetric ? JOB_TYPE.SINGLE_METRIC : JOB_TYPE.MULTI_METRIC;

    if (isSingleMetric) {
      jobConfig.model_plot_config = {
        enabled: true,
        annotations_enabled: true,
      };
    }

    return {
      jobConfig,
      datafeedConfig,
      jobType,
    };
  }
}

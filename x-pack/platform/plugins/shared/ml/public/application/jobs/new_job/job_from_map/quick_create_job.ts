/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import type { Filter, Query } from '@kbn/es-query';
import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { MapApi } from '@kbn/maps-plugin/public';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { MlApi } from '../../../services/ml_api_service';
import {
  CREATED_BY_LABEL,
  JOB_TYPE,
  DEFAULT_BUCKET_SPAN,
} from '../../../../../common/constants/new_job';
import { createEmptyJob, createEmptyDatafeed } from '../common/job_creator/util/default_configs';
import type { JobCreatorType } from '../common/job_creator';
import { getJobsItemsFromEmbeddable } from './utils';
import type { CreateState } from '../job_from_dashboard';
import { QuickJobCreatorBase } from '../job_from_dashboard';
import { getDefaultQuery } from '../utils/new_job_utils';
import { jobCloningService } from '../../../services/job_cloning_service';

interface VisDescriptor {
  dashboard: { query: Query; filters: Filter[] };
  embeddable: { query: Query; filters: Filter[] };
  dataViewId?: string;
  sourceDataView?: DataView;
  geoField: string;
  splitField: string | null;
  bucketSpan?: string;
  layerLevelQuery?: Query | null;
}

export class QuickGeoJobCreator extends QuickJobCreatorBase {
  constructor(
    dataViews: DataViewsContract,
    kibanaConfig: IUiSettingsClient,
    timeFilter: TimefilterContract,
    share: SharePluginStart,
    mlApi: MlApi,
    cps?: CPSPluginStart
  ) {
    super(dataViews, kibanaConfig, timeFilter, share, mlApi, cps);
  }

  public async createAndSaveGeoJob({
    jobId,
    bucketSpan,
    embeddable,
    startJob,
    runInRealTime,
    dataViewId,
    sourceDataView,
    geoField,
    splitField,
    layerLevelQuery,
  }: {
    jobId: string;
    bucketSpan: string;
    embeddable: MapApi;
    startJob: boolean;
    runInRealTime: boolean;
    dataViewId?: string;
    sourceDataView?: DataView;
    geoField: string;
    splitField: string | null;
    layerLevelQuery: Query | null;
  }): Promise<CreateState> {
    const {
      query: dashboardQuery,
      filters: dashboardFilters,
      to,
      from,
      dashboard,
    } = await getJobsItemsFromEmbeddable(embeddable);

    // Map level stuff
    const embeddableQuery = (embeddable.query$?.value as Query) ?? getDefaultQuery();
    const embeddableFilters = embeddable.filters$?.value ?? [];

    if (dashboardQuery === undefined || dashboardFilters === undefined) {
      throw new Error('Cannot create job, query and filters are undefined');
    }
    const { jobConfig, datafeedConfig, start, end } = await this.createGeoJob({
      dataViewId,
      sourceDataView,
      from,
      to,
      query: dashboardQuery,
      filters: dashboardFilters,
      embeddableQuery,
      embeddableFilters,
      layerLevelQuery,
      geoField,
      splitField,
      bucketSpan,
    });

    const result = await this.putJobAndDataFeed({
      jobId,
      datafeedConfig,
      jobConfig,
      createdByLabel: CREATED_BY_LABEL.GEO_FROM_LENS,
      dashboard,
      start,
      end,
      startJob,
      runInRealTime,
    });
    return result;
  }

  public async createAndStashGeoJob(
    dataViewId: string,
    startString: string,
    endString: string,
    query: Query,
    filters: Filter[],
    embeddableQuery: Query,
    embeddableFilters: Filter[],
    geoField: string,
    splitField: string | null = null,
    layerLevelQuery?: Query
  ) {
    try {
      const { jobConfig, datafeedConfig, start, end, includeTimeRange } = await this.createGeoJob({
        dataViewId,
        from: startString,
        to: endString,
        query,
        filters,
        embeddableQuery,
        embeddableFilters,
        geoField,
        splitField,
        layerLevelQuery,
      });

      // add job config and start and end dates to the
      // job cloning stash, so they can be used
      // by the new job wizards
      jobCloningService.stashJobForCloning(
        {
          jobConfig,
          datafeedConfig,
          createdBy: CREATED_BY_LABEL.GEO,
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

  private async createGeoJob({
    dataViewId,
    sourceDataView,
    from,
    to,
    query,
    filters,
    embeddableQuery,
    embeddableFilters,
    layerLevelQuery,
    geoField,
    splitField,
    bucketSpan,
  }: {
    dataViewId?: string;
    sourceDataView?: DataView;
    from: string;
    to: string;
    query: Query;
    filters: Filter[];
    embeddableQuery: Query;
    embeddableFilters: Filter[];
    layerLevelQuery?: Query | null;
    geoField: string;
    splitField: string | null;
    bucketSpan?: string;
  }) {
    const { jobConfig, datafeedConfig, jobType } = await this.createGeoJobFromMapEmbeddable({
      sourceDataView,
      dataViewId,
      dashboard: { query, filters },
      embeddable: { query: embeddableQuery, filters: embeddableFilters },
      layerLevelQuery,
      geoField,
      splitField,
      ...(bucketSpan ? { bucketSpan } : {}),
    });

    let start: number | undefined;
    let end: number | undefined;
    let includeTimeRange = true;

    try {
      // attempt to parse the start and end dates.
      // if start and end values cannot be determined
      // instruct the job cloning code to auto-select the
      // full time range for the index.
      const { min, max } = this.timeFilter.calculateBounds({ to, from });
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

  private async createGeoJobFromMapEmbeddable({
    sourceDataView,
    dataViewId,
    dashboard,
    embeddable,
    layerLevelQuery,
    bucketSpan,
    geoField,
    splitField,
  }: VisDescriptor) {
    const dataView: DataView = sourceDataView
      ? sourceDataView
      : await this.dataViews.get(dataViewId!, true);

    const jobConfig = createEmptyJob();
    const datafeedConfig = createEmptyDatafeed(dataView.getIndexPattern());

    const combinedFiltersAndQueries = this.combineQueriesAndFilters(
      dashboard,
      embeddable,
      dataView!,
      layerLevelQuery ? { query: layerLevelQuery, filters: [] } : undefined
    );

    datafeedConfig.query = combinedFiltersAndQueries;
    jobConfig.analysis_config.detectors = [
      {
        function: 'lat_long',
        field_name: geoField,
        ...(splitField ? { partition_field_name: splitField } : {}),
      },
    ];
    jobConfig.data_description.time_field = dataView.timeFieldName;
    jobConfig.analysis_config.bucket_span = bucketSpan ?? DEFAULT_BUCKET_SPAN;
    if (splitField) {
      jobConfig.analysis_config.influencers = [splitField];
    }

    return {
      jobConfig,
      datafeedConfig,
      jobType: JOB_TYPE.GEO,
    };
  }
}

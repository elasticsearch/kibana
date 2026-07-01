/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { mergeWith, uniqWith, isEqual } from 'lodash';
import type { IUiSettingsClient } from '@kbn/core/public';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import { firstValueFrom } from 'rxjs';
import type { estypes } from '@elastic/elasticsearch';
import type { DashboardApi } from '@kbn/dashboard-plugin/public';
import type { DashboardLocatorParams } from '@kbn/dashboard-plugin/common';
import { getTitle } from '@kbn/presentation-publishing';
import type { Filter, Query, DataViewBase } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import type { ErrorType } from '@kbn/ml-error-utils';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import { DASHBOARD_APP_LOCATOR } from '@kbn/deeplinks-analytics';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import type { Datafeed } from '@kbn/ml-common-types/anomaly_detection_jobs/datafeed';
import type { Job } from '@kbn/ml-common-types/anomaly_detection_jobs/job';
import type { MlApi } from '../../../services/ml_api_service';
import { getFiltersForDSLQuery } from '../../../../../common/util/job_utils';
import type { CREATED_BY_LABEL } from '../../../../../common/constants/new_job';
import { createQueries } from '../utils/new_job_utils';
import { createDatafeedId } from '../../../../../common/util/job_utils';

interface CreationState {
  success: boolean;
  error?: ErrorType;
}

export interface CreateState {
  jobCreated: CreationState;
  datafeedCreated: CreationState;
  jobOpened: CreationState;
  datafeedStarted: CreationState;
}

function mergeQueriesCheck(
  objValue: estypes.QueryDslQueryContainer,
  srcValue: estypes.QueryDslQueryContainer
) {
  if (Array.isArray(objValue)) {
    const combinedQuery = objValue.concat(srcValue);
    return uniqWith(combinedQuery, isEqual);
  }
}

export class QuickJobCreatorBase {
  constructor(
    protected readonly dataViews: DataViewsContract,
    protected readonly kibanaConfig: IUiSettingsClient,
    protected readonly timeFilter: TimefilterContract,
    protected readonly share: SharePluginStart,
    protected readonly mlApi: MlApi,
    protected readonly cps?: CPSPluginStart
  ) {}

  protected async putJobAndDataFeed({
    jobId,
    datafeedConfig,
    jobConfig,
    createdByLabel,
    start,
    end,
    startJob,
    runInRealTime,
    dashboard,
  }: {
    jobId: string;
    datafeedConfig: Datafeed;
    jobConfig: Job;
    createdByLabel: CREATED_BY_LABEL;
    start: number | undefined;
    end: number | undefined;
    startJob: boolean;
    runInRealTime: boolean;
    dashboard?: DashboardApi;
  }) {
    const datafeedId = createDatafeedId(jobId);
    const projectRouting = this.cps?.cpsManager?.getProjectRouting();
    const datafeed = {
      ...datafeedConfig,
      job_id: jobId,
      datafeed_id: datafeedId,
      ...(projectRouting ? { project_routing: projectRouting } : {}),
    };

    const job: estypes.MlJob = {
      ...jobConfig,
      job_id: jobId,
      custom_settings: {
        created_by: createdByLabel,
        ...(dashboard ? await this.getCustomUrls(dashboard, datafeed) : {}),
      },
    };

    const result: CreateState = {
      jobCreated: { success: false },
      datafeedCreated: { success: false },
      jobOpened: { success: false },
      datafeedStarted: { success: false },
    };

    // calculate model memory limit
    try {
      if (
        start !== undefined &&
        end !== undefined &&
        job.data_description.time_field !== undefined &&
        datafeedConfig.indices.length > 0
      ) {
        const { modelMemoryLimit } = await firstValueFrom(
          this.mlApi.calculateModelMemoryLimit$({
            datafeedConfig: datafeed,
            analysisConfig: job.analysis_config,
            indexPattern: datafeedConfig.indices[0],
            query: datafeedConfig.query,
            timeFieldName: job.data_description.time_field,
            earliestMs: start,
            latestMs: end,
          })
        );
        if (job.analysis_limits === undefined) {
          job.analysis_limits = {};
        }
        job.analysis_limits.model_memory_limit = modelMemoryLimit;
      }
    } catch (error) {
      // could not calculate mml, continue with job creation as default value will be used.
      // eslint-disable-next-line no-console
      console.error('could not calculate model memory limit', error);
    }

    // put job
    try {
      await this.mlApi.addJob({ jobId: job.job_id, job });
    } catch (error) {
      result.jobCreated.error = error;
      return result;
    }
    result.jobCreated.success = true;

    // put datafeed
    try {
      await this.mlApi.addDatafeed({ datafeedId, datafeedConfig: datafeed });
    } catch (error) {
      result.datafeedCreated.error = error;
      return result;
    }
    result.datafeedCreated.success = true;

    if (startJob) {
      // open job, ignore error if already open
      try {
        await this.mlApi.openJob({ jobId });
      } catch (error) {
        // job may already be open, so ignore 409 error.
        if (error.body.statusCode !== 409) {
          result.jobOpened.error = error;
          return result;
        }
      }
      result.jobOpened.success = true;

      // start datafeed
      try {
        await this.mlApi.startDatafeed({
          datafeedId,
          start,
          ...(runInRealTime ? {} : { end }),
        });
      } catch (error) {
        result.datafeedStarted.error = error;
        return result;
      }
      result.datafeedStarted.success = true;
    }

    return result;
  }

  protected combineQueriesAndFilters(
    dashboard: { query: Query; filters: Filter[] },
    vis: { query: Query; filters: Filter[] },
    dataView: DataViewBase,
    layerQuery?: { query: Query; filters: Filter[] }
  ): estypes.QueryDslQueryContainer {
    let mergedVisAndLayerQueries;

    const { combinedQuery: dashboardQueries } = createQueries(
      {
        query: dashboard.query,
        filter: dashboard.filters,
      },
      dataView,
      this.kibanaConfig
    );

    const { combinedQuery: visQueries } = createQueries(
      {
        query: vis.query,
        filter: vis.filters,
      },
      dataView,
      this.kibanaConfig
    );

    if (layerQuery) {
      const { combinedQuery: layerQueries } = createQueries(
        {
          query: layerQuery.query,
          filter: layerQuery.filters,
        },
        dataView,
        this.kibanaConfig
      );
      // combine vis and layer queries if layer-level query exists
      mergedVisAndLayerQueries = mergeWith(visQueries, layerQueries, mergeQueriesCheck);
    }

    const mergedQueries = mergeWith(
      dashboardQueries,
      mergedVisAndLayerQueries ? mergedVisAndLayerQueries : visQueries,
      mergeQueriesCheck
    );

    return mergedQueries;
  }

  private async createDashboardLink(dashboard: DashboardApi, datafeedConfig: estypes.MlDatafeed) {
    const savedObjectId = dashboard.savedObjectId$?.value;
    if (!savedObjectId) {
      return null;
    }

    const params: DashboardLocatorParams = {
      dashboardId: savedObjectId,
      time_range: {
        from: '$earliest$',
        to: '$latest$',
        mode: 'absolute',
      },
      filters: getFiltersForDSLQuery(
        datafeedConfig.query,
        undefined,
        datafeedConfig.job_id,
        FilterStateStore.GLOBAL_STATE
      ),
    };

    const location = await this.share.url.locators.get(DASHBOARD_APP_LOCATOR)?.getLocation(params);
    if (location === undefined) {
      return null;
    }

    const url = `${location.app}${location.path}`;
    const urlName = i18n.translate('xpack.ml.newJob.fromLens.createJob.namedUrlDashboard', {
      defaultMessage: 'Open {dashboardTitle}',
      values: { dashboardTitle: getTitle(dashboard) ?? 'dashboard' },
    });

    return { url_name: urlName, url_value: url, time_range: 'auto' };
  }

  private async getCustomUrls(dashboard: DashboardApi, datafeedConfig: estypes.MlDatafeed) {
    const customUrls = await this.createDashboardLink(dashboard, datafeedConfig);
    return dashboard !== undefined && customUrls !== null ? { custom_urls: [customUrls] } : {};
  }
}

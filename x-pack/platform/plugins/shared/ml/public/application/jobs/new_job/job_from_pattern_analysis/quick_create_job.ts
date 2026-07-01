/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IUiSettingsClient } from '@kbn/core/public';
import type { DataPublicPluginStart, TimefilterContract } from '@kbn/data-plugin/public';
import type { SharePluginStart } from '@kbn/share-plugin/public';
import type { DataViewField, DataView } from '@kbn/data-views-plugin/common';
import type { DataViewsContract } from '@kbn/data-views-plugin/public';
import type { TimeRange } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { MLCATEGORY, ML_JOB_AGGREGATION } from '@kbn/ml-anomaly-utils';
import type { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types';
import type { CPSPluginStart } from '@kbn/cps/public/types';
import { CREATED_BY_LABEL, DEFAULT_BUCKET_SPAN } from '../../../../../common/constants/new_job';
import { type CreateState, QuickJobCreatorBase } from '../job_from_dashboard/quick_create_job_base';
import type { MlApi } from '../../../services/ml_api_service';
import { createEmptyDatafeed, createEmptyJob } from '../common/job_creator/util/default_configs';
import type { JobCreatorType } from '../common/job_creator';
import { jobCloningService } from '../../../services/job_cloning_service';

export const CATEGORIZATION_TYPE = {
  COUNT: ML_JOB_AGGREGATION.COUNT,
  HIGH_COUNT: ML_JOB_AGGREGATION.HIGH_COUNT,
  RARE: ML_JOB_AGGREGATION.RARE,
} as const;

export type CategorizationType = (typeof CATEGORIZATION_TYPE)[keyof typeof CATEGORIZATION_TYPE];

export class QuickCategorizationJobCreator extends QuickJobCreatorBase {
  constructor(
    dataViews: DataViewsContract,
    kibanaConfig: IUiSettingsClient,
    timeFilter: TimefilterContract,
    share: SharePluginStart,
    private data: DataPublicPluginStart,
    mlApi: MlApi,
    cps?: CPSPluginStart
  ) {
    super(dataViews, kibanaConfig, timeFilter, share, mlApi, cps);
  }

  public async createAndSaveJob(
    categorizationType: CategorizationType,
    jobId: string,
    bucketSpan: string,
    dataView: DataView,
    field: DataViewField,
    partitionField: DataViewField | null,
    stopOnWarn: boolean,
    query: QueryDslQueryContainer,
    timeRange: TimeRange,
    startJob: boolean,
    runInRealTime: boolean
  ): Promise<CreateState> {
    if (query === undefined) {
      throw new Error('Cannot create job, query and filters are undefined');
    }

    const { jobConfig, datafeedConfig, start, end } = await this.createJob(
      categorizationType,
      dataView,
      field,
      partitionField,
      stopOnWarn,
      timeRange,
      query,
      bucketSpan
    );
    const createdByLabel = CREATED_BY_LABEL.CATEGORIZATION_FROM_PATTERN_ANALYSIS;

    const result = await this.putJobAndDataFeed({
      jobId,
      datafeedConfig,
      jobConfig,
      createdByLabel,
      start,
      end,
      startJob,
      runInRealTime,
    });
    return result;
  }

  public async createAndStashADJob(
    categorizationType: CategorizationType,
    dataViewId: string,
    fieldName: string,
    partitionFieldName: string | null,
    stopOnWarn: boolean,
    startString: string,
    endString: string,
    query: QueryDslQueryContainer
  ) {
    try {
      const dataView = await this.data.dataViews.get(dataViewId);
      const field = dataView.getFieldByName(fieldName);
      const partitionField = partitionFieldName
        ? dataView.getFieldByName(partitionFieldName) ?? null
        : null;

      if (field === undefined) {
        throw new Error('Cannot create job, field is undefined');
      }

      const { jobConfig, datafeedConfig, start, end, includeTimeRange } = await this.createJob(
        categorizationType,
        dataView,
        field,
        partitionField,
        stopOnWarn,
        { from: startString, to: endString },
        query,
        DEFAULT_BUCKET_SPAN
      );

      // add job config and start and end dates to the
      // job cloning stash, so they can be used
      // by the new job wizards
      jobCloningService.stashJobForCloning(
        {
          jobConfig,
          datafeedConfig,
          createdBy: CREATED_BY_LABEL.CATEGORIZATION_FROM_PATTERN_ANALYSIS,
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
    categorizationType: CategorizationType,
    dataView: DataView,
    field: DataViewField,
    partitionField: DataViewField | null,
    stopOnWarn: boolean,
    timeRange: TimeRange,
    query: QueryDslQueryContainer,
    bucketSpan: string
  ) {
    const jobConfig = createEmptyJob();
    const datafeedConfig = createEmptyDatafeed(dataView.getIndexPattern());

    datafeedConfig.query = query;
    jobConfig.analysis_config = {
      categorization_field_name: field.name,
      per_partition_categorization: {
        enabled: partitionField !== null,
        stop_on_warn: stopOnWarn,
      },
      influencers: [MLCATEGORY],
      detectors: [
        {
          function: categorizationType,
          by_field_name: MLCATEGORY,
        },
      ],
      bucket_span: bucketSpan,
    };

    if (partitionField !== null) {
      jobConfig.analysis_config.detectors[0].partition_field_name = partitionField.name;
      jobConfig.analysis_config.influencers!.push(partitionField.name);
    }

    jobConfig.data_description.time_field = dataView.timeFieldName;

    let start: number | undefined;
    let end: number | undefined;
    let includeTimeRange = true;

    try {
      // attempt to parse the start and end dates.
      // if start and end values cannot be determined
      // instruct the job cloning code to auto-select the
      // full time range for the index.
      const { min, max } = this.timeFilter.calculateBounds(timeRange);
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
      start,
      end,
      includeTimeRange,
    };
  }
}

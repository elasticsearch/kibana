/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useContext, useState } from 'react';
import { i18n } from '@kbn/i18n';
import { EVENT_RATE_FIELD_ID } from '@kbn/ml-anomaly-utils';
import type { BucketSpanEstimatorData } from '@kbn/ml-common-types/job_service';
import { useMlApi } from '../../../../../../../contexts/kibana';
import { JobCreatorContext } from '../../../job_creator_context';
import {
  isMultiMetricJobCreator,
  isPopulationJobCreator,
  isAdvancedJobCreator,
  isRareJobCreator,
} from '../../../../../common/job_creator';
import { useDataSource } from '../../../../../../../contexts/ml';
import { useToastNotificationService } from '../../../../../../../services/toast_notification_service';

export enum ESTIMATE_STATUS {
  NOT_RUNNING,
  RUNNING,
}

export function useEstimateBucketSpan() {
  const toastNotificationService = useToastNotificationService();
  const mlApi = useMlApi();
  const { jobCreator, jobCreatorUpdate } = useContext(JobCreatorContext);
  const dataSourceContext = useDataSource();

  const [status, setStatus] = useState(ESTIMATE_STATUS.NOT_RUNNING);

  const data: BucketSpanEstimatorData = {
    aggTypes: jobCreator.aggregations.map((a) => a.dslName),
    duration: {
      start: jobCreator.start,
      end: jobCreator.end,
    },
    fields: jobCreator.fields.map((f) => (f.id === EVENT_RATE_FIELD_ID ? null : f.id)),
    index: dataSourceContext.selectedDataView.title,
    query: dataSourceContext.combinedQuery,
    splitField: undefined,
    timeField: dataSourceContext.selectedDataView.timeFieldName,
    runtimeMappings: jobCreator.runtimeMappings ?? undefined,
    indicesOptions: jobCreator.datafeedConfig.indices_options,
    projectRouting: jobCreator.projectRouting ?? undefined,
  };

  if (isMultiMetricJobCreator(jobCreator) && jobCreator.splitField !== null) {
    data.splitField = jobCreator.splitField.id;
  } else if (isPopulationJobCreator(jobCreator) && jobCreator.populationField !== null) {
    data.splitField = jobCreator.populationField.id;
  } else if (isRareJobCreator(jobCreator)) {
    data.fields = [null];
    if (jobCreator.populationField) {
      data.splitField = jobCreator.populationField.id;
    } else {
      data.splitField = jobCreator.rareField?.id;
    }
  } else if (isAdvancedJobCreator(jobCreator)) {
    jobCreator.richDetectors.some((d) => {
      if (d.partitionField !== null) {
        data.splitField = d.partitionField.id;
        return true;
      }
      if (d.overField !== null) {
        data.splitField = d.overField.id;
        return true;
      }
      if (d.byField !== null) {
        data.splitField = d.byField.id;
        return true;
      }
    });
  }

  async function estimateBucketSpan() {
    setStatus(ESTIMATE_STATUS.RUNNING);
    const { name, error, message: text } = await mlApi.estimateBucketSpan(data);
    setStatus(ESTIMATE_STATUS.NOT_RUNNING);
    if (error === true) {
      const title = i18n.translate(
        'xpack.ml.newJob.wizard.pickFieldsStep.bucketSpanEstimator.errorTitle',
        {
          defaultMessage: 'Bucket span could not be estimated',
        }
      );
      toastNotificationService.displayWarningToast({ title, text });
    } else {
      jobCreator.bucketSpan = name;
      jobCreatorUpdate();
    }
  }
  return { status, estimateBucketSpan };
}

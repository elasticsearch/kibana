/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, Fragment, useMemo } from 'react';
import { EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getTimeFilterRange, useTimefilter } from '@kbn/ml-date-picker';
import { EVENT_RATE_FIELD_ID } from '@kbn/ml-anomaly-utils';
import { useTimeBuckets } from '@kbn/ml-time-buckets';
import { jobCloningService } from '../../../../services/job_cloning_service';
import { Wizard } from './wizard';
import { WIZARD_STEPS } from '../components/step_types';
import { cloneDatafeed, getJobCreatorTitle } from '../../common/job_creator/util/general';
import {
  jobCreatorFactory,
  isAdvancedJobCreator,
  isCategorizationJobCreator,
  isRareJobCreator,
  isGeoJobCreator,
} from '../../common/job_creator';
import {
  JOB_TYPE,
  DEFAULT_MODEL_MEMORY_LIMIT,
  DEFAULT_BUCKET_SPAN,
} from '../../../../../../common/constants/new_job';
import { ChartLoader } from '../../common/chart_loader';
import { MapLoader } from '../../common/map_loader';
import { ResultsLoader } from '../../common/results_loader';
import { JobValidator } from '../../common/job_validator';
import { useDataSource } from '../../../../contexts/ml';
import { useMlApi, useMlKibana } from '../../../../contexts/kibana';
import type { ExistingJobsAndGroups } from '../../../../services/job_service';
import { useNewJobCapsService } from '../../../../services/new_job_capabilities/new_job_capabilities_service';
import { getNewJobDefaults } from '../../../../services/ml_server_info';
import { useToastNotificationService } from '../../../../services/toast_notification_service';
import { MlAppHeader } from '../../../../components/ml_app_header';

const PAGE_WIDTH = 1200; // document.querySelector('.single-metric-job-container').width();
const BAR_TARGET = PAGE_WIDTH > 2000 ? 1000 : PAGE_WIDTH / 2;
const MAX_BARS = BAR_TARGET + (BAR_TARGET / 100) * 100; // 100% larger than bar target

export interface PageProps {
  existingJobsAndGroups: ExistingJobsAndGroups;
  jobType: JOB_TYPE;
}

export const Page: FC<PageProps> = ({ existingJobsAndGroups, jobType }) => {
  const timefilter = useTimefilter();
  const dataSourceContext = useDataSource();
  const {
    services: { maps: mapsPlugin, uiSettings },
  } = useMlKibana();
  const mlApi = useMlApi();
  const newJobCapsService = useNewJobCapsService();

  const chartInterval = useTimeBuckets(uiSettings);

  const jobCreator = useMemo(
    () =>
      jobCreatorFactory(jobType)(
        mlApi,
        newJobCapsService,
        dataSourceContext.selectedDataView,
        dataSourceContext.selectedSavedSearch,
        dataSourceContext.combinedQuery
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobType]
  );

  const jobValidator = useMemo(() => new JobValidator(jobCreator), [jobCreator]);

  const { displayErrorToast } = useToastNotificationService();

  const { from, to } = getTimeFilterRange(timefilter);
  jobCreator.setTimeRange(from, to);

  let firstWizardStep =
    jobType === JOB_TYPE.ADVANCED
      ? WIZARD_STEPS.ADVANCED_CONFIGURE_DATAFEED
      : WIZARD_STEPS.TIME_RANGE;

  let autoSetTimeRange = jobCloningService.autoSetTimeRange;

  if (jobCloningService.job !== undefined && jobCloningService.datafeed !== undefined) {
    // cloning a job
    const clonedJob = jobCloningService.job;
    const clonedDatafeed = cloneDatafeed(jobCloningService.datafeed);

    initCategorizationSettings();
    jobCreator.cloneFromExistingJob(clonedJob, clonedDatafeed);

    // if we're not skipping the time range, this is a standard job clone, so wipe the jobId
    if (jobCloningService.skipTimeRangeStep === false) {
      jobCreator.jobId = '';
    } else if (jobType !== JOB_TYPE.ADVANCED) {
      firstWizardStep = WIZARD_STEPS.PICK_FIELDS;
    }

    if (jobCloningService.start !== undefined && jobCloningService.end !== undefined) {
      // auto select the start and end dates for the time range picker
      jobCreator.setTimeRange(jobCloningService.start, jobCloningService.end);
    } else {
      // if not start and end times are set and this is an advanced job,
      // auto set the time range based on the index
      autoSetTimeRange = autoSetTimeRange || isAdvancedJobCreator(jobCreator);
    }

    if (jobCloningService.calendars) {
      jobCreator.calendars = jobCloningService.calendars;
    }
    jobCloningService.clearJobCloningData();
  } else {
    // creating a new job
    jobCreator.bucketSpan = DEFAULT_BUCKET_SPAN;

    if (
      jobCreator.type !== JOB_TYPE.POPULATION &&
      jobCreator.type !== JOB_TYPE.ADVANCED &&
      jobCreator.type !== JOB_TYPE.CATEGORIZATION
    ) {
      // for all other than population or advanced, use 10MB
      jobCreator.modelMemoryLimit = DEFAULT_MODEL_MEMORY_LIMIT;
    }

    if (jobCreator.type === JOB_TYPE.SINGLE_METRIC) {
      jobCreator.modelPlot = true;
      jobCreator.modelChangeAnnotations = true;
    }

    if (dataSourceContext.selectedSavedSearch !== null) {
      // Jobs created from saved searches cannot be cloned in the wizard as the
      // ML job config holds no reference to the saved search ID.
      jobCreator.createdBy = null;
    }

    // auto set the time range if creating a new advanced job
    autoSetTimeRange = isAdvancedJobCreator(jobCreator);
    initCategorizationSettings();
    if (isCategorizationJobCreator(jobCreator)) {
      const { catFields } = newJobCapsService;
      if (catFields.length === 1) {
        jobCreator.categorizationFieldName = catFields[0].name;
      }
    }
  }

  if (autoSetTimeRange) {
    // for advanced jobs, load the full time range start and end times
    // so they can be used for job validation and bucket span estimation
    jobCreator.autoSetTimeRange().catch((error) => {
      const title = i18n.translate('xpack.ml.newJob.wizard.autoSetJobCreatorTimeRange.error', {
        defaultMessage: `Error retrieving beginning and end times of index`,
      });
      displayErrorToast(error, title);
    });
  }

  function initCategorizationSettings() {
    if (isCategorizationJobCreator(jobCreator)) {
      // categorization job will always use a count agg, so give it
      // to the job creator now
      const count = newJobCapsService.getAggById('count');
      const highCount = newJobCapsService.getAggById('high_count');
      const rare = newJobCapsService.getAggById('rare');
      const eventRate = newJobCapsService.getFieldById(EVENT_RATE_FIELD_ID);
      jobCreator.setDefaultDetectorProperties(count, highCount, rare, eventRate);

      const { anomaly_detectors: anomalyDetectors } = getNewJobDefaults();
      jobCreator.categorizationAnalyzer = anomalyDetectors.categorization_analyzer!;
    } else if (isRareJobCreator(jobCreator)) {
      const rare = newJobCapsService.getAggById('rare');
      const freqRare = newJobCapsService.getAggById('freq_rare');
      jobCreator.setDefaultDetectorProperties(rare, freqRare);
    } else if (isGeoJobCreator(jobCreator)) {
      const geo = newJobCapsService.getAggById('lat_long');
      jobCreator.setDefaultDetectorProperties(geo);
    }
  }

  chartInterval.setBarTarget(BAR_TARGET);
  chartInterval.setMaxBars(MAX_BARS);
  chartInterval.setInterval('auto');

  const chartLoader = useMemo(
    () => new ChartLoader(mlApi, dataSourceContext.selectedDataView, jobCreator.query),
    [mlApi, dataSourceContext.selectedDataView, jobCreator.query]
  );

  const mapLoader = useMemo(
    () => new MapLoader(mlApi, dataSourceContext.selectedDataView, jobCreator.query, mapsPlugin),
    [mlApi, dataSourceContext.selectedDataView, jobCreator.query, mapsPlugin]
  );

  const resultsLoader = useMemo(
    () => new ResultsLoader(jobCreator, chartInterval, chartLoader),
    [jobCreator, chartInterval, chartLoader]
  );

  useEffect(() => {
    return () => {
      jobCreator.forceStopRefreshPolls();
    };
  });

  const jobCreatorTitle = getJobCreatorTitle(jobCreator);

  return (
    <Fragment>
      <div data-test-subj={`mlPageJobWizardHeader-${jobCreator.type}`}>
        <MlAppHeader
          title={`${i18n.translate('xpack.ml.newJob.page.createJob', {
            defaultMessage: 'Create job',
          })}: ${jobCreatorTitle}`}
        />
      </div>

      <div style={{ backgroundColor: 'inherit' }} data-test-subj={`mlPageJobWizard ${jobType}`}>
        <EuiText size={'s'}>
          {dataSourceContext.selectedDataView.isPersisted() ? (
            <FormattedMessage
              id="xpack.ml.newJob.page.createJob.dataViewName"
              defaultMessage="Using data view {dataViewName}"
              values={{ dataViewName: jobCreator.indexPatternDisplayName }}
            />
          ) : (
            <FormattedMessage
              id="xpack.ml.newJob.page.createJob.tempDataViewName"
              defaultMessage="Using temporary data view {dataViewName}"
              values={{ dataViewName: jobCreator.indexPatternDisplayName }}
            />
          )}
        </EuiText>

        <Wizard
          jobCreator={jobCreator}
          chartLoader={chartLoader}
          mapLoader={mapLoader}
          resultsLoader={resultsLoader}
          chartInterval={chartInterval}
          jobValidator={jobValidator}
          existingJobsAndGroups={existingJobsAndGroups}
          firstWizardStep={firstWizardStep}
        />
      </div>
    </Fragment>
  );
};

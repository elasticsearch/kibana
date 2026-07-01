/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useState, useEffect, useCallback } from 'react';
import type { TimeBuckets } from '@kbn/ml-time-buckets';
import { useModelMemoryEstimator } from '../../common/job_creator/util/model_memory_estimator';
import { WIZARD_STEPS } from '../components/step_types';

import type { JobCreatorContextValue } from '../components/job_creator_context';
import { JobCreatorContext } from '../components/job_creator_context';
import type { ExistingJobsAndGroups } from '../../../../services/job_service';

import type { JobCreatorType } from '../../common/job_creator';
import type { ChartLoader } from '../../common/chart_loader';
import type { MapLoader } from '../../common/map_loader';
import type { ResultsLoader } from '../../common/results_loader';
import type { JobValidator } from '../../common/job_validator';
import { useNewJobCapsService } from '../../../../services/new_job_capabilities/new_job_capabilities_service';
import { WizardSteps } from './wizard_steps';
import { WizardHorizontalSteps } from './wizard_horizontal_steps';
import { JOB_TYPE } from '../../../../../../common/constants/new_job';

interface Props {
  jobCreator: JobCreatorType;
  chartLoader: ChartLoader;
  mapLoader: MapLoader;
  resultsLoader: ResultsLoader;
  chartInterval: TimeBuckets;
  jobValidator: JobValidator;
  existingJobsAndGroups: ExistingJobsAndGroups;
  firstWizardStep: WIZARD_STEPS;
}

export const Wizard: FC<Props> = ({
  jobCreator,
  chartLoader,
  mapLoader,
  resultsLoader,
  chartInterval,
  jobValidator,
  existingJobsAndGroups,
  firstWizardStep = WIZARD_STEPS.TIME_RANGE,
}) => {
  const newJobCapsService = useNewJobCapsService();
  const [jobCreatorUpdated, setJobCreatorUpdate] = useState(0);
  const jobCreatorUpdate = useCallback(() => {
    setJobCreatorUpdate((prev) => prev + 1);
  }, []);

  const [jobValidatorUpdated, setJobValidatorUpdate] = useState(0);
  const jobValidatorUpdate = useCallback(() => {
    setJobValidatorUpdate((prev) => prev + 1);
  }, []);

  const jobCreatorContext: JobCreatorContextValue = {
    jobCreatorUpdated,
    jobCreatorUpdate,
    jobCreator,
    chartLoader,
    mapLoader,
    resultsLoader,
    chartInterval,
    jobValidator,
    jobValidatorUpdated,
    fields: newJobCapsService.fields,
    aggs: newJobCapsService.aggs,
    existingJobsAndGroups,
  };

  const firstStep =
    jobCreator.type === JOB_TYPE.ADVANCED
      ? WIZARD_STEPS.ADVANCED_CONFIGURE_DATAFEED
      : WIZARD_STEPS.TIME_RANGE;

  const [currentStep, setCurrentStep] = useState(firstStep);
  const [highestStep, setHighestStep] = useState(firstStep);
  const [disableSteps, setDisableSteps] = useState(false);
  const [progress, setProgress] = useState(resultsLoader.progress);
  const [stringifiedConfigs, setStringifiedConfigs] = useState(
    stringifyConfigs(jobCreator.jobConfig, jobCreator.datafeedConfig)
  );

  useEffect(() => {
    const validationSubscription = jobValidator.validationResult$.subscribe(() => {
      jobValidatorUpdate();
    });

    return () => {
      validationSubscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobValidator]);

  useEffect(() => {
    jobValidator.validate(() => {
      jobValidatorUpdate();
    });

    // if the job config has changed, reset the highestStep
    // compare a stringified config to ensure the configs have actually changed
    const tempConfigs = stringifyConfigs(jobCreator.jobConfig, jobCreator.datafeedConfig);
    if (tempConfigs !== stringifiedConfigs) {
      setHighestStep(currentStep);
      setStringifiedConfigs(tempConfigs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobCreatorUpdated]);

  useEffect(() => {
    jobCreator.subscribeToProgress(setProgress);

    setCurrentStep(firstWizardStep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // disable the step links if the job is running
  useEffect(() => {
    setDisableSteps(progress > 0);
  }, [progress]);

  // keep a record of the highest step reached in the wizard
  useEffect(() => {
    if (currentStep >= highestStep) {
      setHighestStep(currentStep);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep]);

  useModelMemoryEstimator(jobCreator, jobValidator, jobCreatorUpdate, jobCreatorUpdated);

  return (
    <JobCreatorContext.Provider value={jobCreatorContext}>
      <WizardHorizontalSteps
        currentStep={currentStep}
        highestStep={highestStep}
        setCurrentStep={setCurrentStep}
        disableSteps={disableSteps}
        jobType={jobCreator.type}
      />
      <WizardSteps currentStep={currentStep} setCurrentStep={setCurrentStep} />
    </JobCreatorContext.Provider>
  );
};

function stringifyConfigs(jobConfig: object, datafeedConfig: object) {
  return JSON.stringify(jobConfig) + JSON.stringify(datafeedConfig);
}

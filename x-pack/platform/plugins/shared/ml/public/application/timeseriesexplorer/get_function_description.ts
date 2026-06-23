/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { lastValueFrom } from 'rxjs';
import { ML_JOB_AGGREGATION } from '@kbn/ml-anomaly-utils';
import type { CombinedJob } from '@kbn/ml-common-types/anomaly_detection_jobs/combined_job';
import { type MlResultsService } from '../services/results_service';
import type { ToastNotificationService } from '../services/toast_notification_service';
import { getControlsForDetector } from './get_controls_for_detector';
import { getCriteriaFields } from './get_criteria_fields';
import { getViewableDetectors } from './timeseriesexplorer_utils/get_viewable_detectors';
import type { MlEntity } from '../../embeddables';

export function isMetricDetector(selectedJob: CombinedJob, selectedDetectorIndex: number) {
  const detectors = getViewableDetectors(selectedJob);
  if (Array.isArray(detectors) && detectors.length >= selectedDetectorIndex) {
    const detector = selectedJob.analysis_config.detectors[selectedDetectorIndex];
    if (detector?.function === ML_JOB_AGGREGATION.METRIC) {
      return true;
    }
  }
  return false;
}

/**
 * Get the function description from the record with the highest anomaly score
 */
export const getFunctionDescription = async (
  {
    selectedDetectorIndex,
    selectedEntities,
    selectedJob,
  }: {
    selectedDetectorIndex: number;
    selectedEntities: MlEntity | undefined;
    selectedJob: CombinedJob;
  },
  toastNotificationService: ToastNotificationService,
  mlResultsService: MlResultsService
) => {
  // if the detector's function is metric, fetch the highest scoring anomaly record
  // and set to plot the function_description (avg/min/max) of that record by default
  if (!isMetricDetector(selectedJob, selectedDetectorIndex)) return;

  const entityControls = getControlsForDetector(
    selectedDetectorIndex,
    selectedEntities,
    selectedJob
  );
  const criteriaFields = getCriteriaFields(selectedDetectorIndex, entityControls);

  try {
    const resp = await lastValueFrom(
      mlResultsService.getRecordsForCriteria([selectedJob.job_id], criteriaFields, 0, null, null, 1)
    );
    if (Array.isArray(resp?.records) && resp.records.length === 1) {
      // grabbing first record because records should have already been sorted by score desc
      const highestScoringAnomaly = resp.records[0];
      return highestScoringAnomaly?.function_description;
    }
    // if there's no anomaly found, auto default to plotting the mean
    return ML_JOB_AGGREGATION.MEAN;
  } catch (error) {
    toastNotificationService.displayErrorToast(
      error,
      i18n.translate('xpack.ml.timeSeriesExplorer.highestAnomalyScoreErrorToastTitle', {
        defaultMessage: 'An error occurred getting record with the highest anomaly score',
      })
    );
  }
};

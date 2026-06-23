/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import type { SeverityThreshold } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import { useSeverityOptions } from './use_severity_options';
import { getSeverityThresholdMax } from '../../../../common/util/severity_threshold';

/**
 * React hook that returns a function to find severity options by threshold values
 * @returns A function that converts threshold objects to severity options
 */
export const useThresholdToSeverity = () => {
  const severityOptions = useSeverityOptions();

  return useCallback(
    (thresholds: SeverityThreshold[]) => {
      // Get corresponding severity objects that match the thresholds
      const matchingSeverities = severityOptions.filter((severity) =>
        thresholds.some(
          (threshold) =>
            threshold.min === severity.threshold.min &&
            getSeverityThresholdMax(threshold) === getSeverityThresholdMax(severity.threshold)
        )
      );

      // Default to lowest severity if no matches found
      if (matchingSeverities.length === 0) {
        return [severityOptions[0]];
      }

      return matchingSeverities;
    },
    [severityOptions]
  );
};

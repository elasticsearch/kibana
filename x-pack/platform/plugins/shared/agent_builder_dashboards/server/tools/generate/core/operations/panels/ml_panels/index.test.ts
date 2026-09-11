/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { anomalyChartsPanelDefinition } from '.';

describe('anomalyChartsPanelDefinition', () => {
  describe('buildPanelContent', () => {
    it('maps a numeric severity_threshold to an open-ended floor', () => {
      expect(
        anomalyChartsPanelDefinition.buildPanelContent({
          job_ids: ['job-1'],
          severity_threshold: 30,
        })
      ).toEqual({
        type: 'ml_anomaly_charts',
        config: {
          job_ids: ['job-1'],
          severity_threshold: [{ min: 30 }],
        },
      });
    });

    it('omits severity_threshold when it is not provided', () => {
      expect(
        anomalyChartsPanelDefinition.buildPanelContent({
          job_ids: ['job-1'],
        })
      ).toEqual({
        type: 'ml_anomaly_charts',
        config: {
          job_ids: ['job-1'],
        },
      });
    });
  });
});

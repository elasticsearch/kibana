/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderWithI18n } from '@kbn/test-jest-helpers';

import { ExplorerChartInfoTooltip } from './explorer_chart_info_tooltip';

describe('ExplorerChartInfoTooltip', () => {
  test('renders tooltip based on infoTooltip data', () => {
    const { getByText } = renderWithI18n(
      <ExplorerChartInfoTooltip
        aggregationInterval="15m"
        chartFunction="avg responsetime"
        entityFields={[
          {
            fieldName: 'airline',
            fieldValue: 'JAL',
          },
        ]}
        jobId="mock-job-id"
      />
    );

    expect(getByText('job ID')).toBeInTheDocument();
    expect(getByText('mock-job-id')).toBeInTheDocument();
    expect(getByText('aggregation interval')).toBeInTheDocument();
    expect(getByText('15m')).toBeInTheDocument();
    expect(getByText('chart function')).toBeInTheDocument();
    expect(getByText('avg responsetime')).toBeInTheDocument();
    expect(getByText('airline')).toBeInTheDocument();
    expect(getByText('JAL')).toBeInTheDocument();
  });
});

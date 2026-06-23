/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MlApi } from '../../application/services/ml_api_service';

import { AnomalyChartsInitializer } from './anomaly_charts_initializer';
import { I18nProvider } from '@kbn/i18n-react';
import React from 'react';
import { getDefaultExplorerChartsPanelTitle } from './utils';
import { kibanaContextMock } from '../../application/contexts/kibana/__mocks__/kibana_context';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public/context/context';
const defaultOptions = { wrapper: I18nProvider };
jest.mock('../../application/services/anomaly_detector_service', () => {
  return {
    AnomalyDetectorService: jest.fn().mockImplementation(() => {
      return {
        getJobs$: jest.fn(),
      };
    }),
  };
});

describe('AnomalyChartsInitializer', () => {
  test('should render anomaly charts initializer', async () => {
    const onCreate = jest.fn();
    const onCancel = jest.fn();
    const adJobsApiService = jest.fn();

    const jobIds = ['job1', 'job2'];
    const defaultTitle = getDefaultExplorerChartsPanelTitle(jobIds);
    const input = {
      max_series_to_plot: 12,
      job_ids: jobIds,
    };
    render(
      <KibanaContextProvider services={kibanaContextMock.services}>
        <AnomalyChartsInitializer
          initialInput={input}
          onCreate={(params) => onCreate(params)}
          onCancel={onCancel}
          adJobsApiService={adJobsApiService as unknown as MlApi['jobs']}
        />
      </KibanaContextProvider>,
      defaultOptions
    );

    const confirmButton = screen.getByText(/Confirm/i).closest('button');
    expect(confirmButton).toBeDefined();
    expect(onCreate).toHaveBeenCalledTimes(0);

    await userEvent.click(confirmButton!);
    expect(onCreate).toHaveBeenCalledWith({
      job_ids: ['job1', 'job2'],
      title: defaultTitle,
      max_series_to_plot: input.max_series_to_plot,
    });
  });
});

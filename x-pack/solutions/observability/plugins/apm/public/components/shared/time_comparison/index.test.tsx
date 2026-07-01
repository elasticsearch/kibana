/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expectTextsInDocument, expectTextsNotInDocument } from '../../../utils/test_helpers';
import { TimeComparison } from '.';
import * as urlHelpers from '../links/url_helpers';
import moment from 'moment';
import {
  mockApmPluginContextValue,
  MockApmPluginContextWrapper,
} from '../../../context/apm_plugin/mock_apm_plugin_context';
import { ENVIRONMENT_ALL } from '../../../../common/environment_filter_values';
import { EXPECTED_BOUNDS_TEST_SUBJ } from './get_comparison_options';
import * as useAnomalyDetectionJobsContextModule from '../../../context/anomaly_detection_jobs/use_anomaly_detection_jobs_context';
import * as useEnvironmentContextModule from '../../../context/environments_context/use_environments_context';
import * as useShouldShowAnomalyUiModule from '../../../hooks/use_should_show_anomaly_ui';
import type { ApmPluginContextValue } from '../../../context/apm_plugin/apm_plugin_context';
import { merge } from 'lodash';
import type { ApmMlJob } from '../../../../common/anomaly_detection/apm_ml_job';
import { AnomalyDetectionSetupState } from '../../../../common/anomaly_detection/get_anomaly_detection_setup_state';
import { FETCH_STATUS } from '../../../hooks/use_fetcher';
import { EuiThemeProvider } from '@elastic/eui';

const ML_AD_JOBS = {
  jobs: [
    {
      jobId: 'apm-prod-9f5f-apm_tx_metrics',
      jobState: 'opened',
      datafeedId: 'datafeed-apm-prod-9f5f-apm_tx_metrics',
      datafeedState: 'started',
      version: 3,
      environment: 'prod',
      bucketSpan: '15m',
    },
    {
      jobId: 'apm-staging-4fec-apm_tx_metrics',
      jobState: 'opened',
      datafeedId: 'datafeed-apm-staging-4fec-apm_tx_metrics',
      datafeedState: 'started',
      version: 3,
      environment: 'staging',
      bucketSpan: '15m',
    },
  ] as ApmMlJob[],
  hasLegacyJobs: false,
};

const NO_ML_AD_JOBS = { jobs: [] as ApmMlJob[], hasLegacyJobs: false };

function getWrapper({
  rangeFrom,
  rangeTo,
  offset,
  comparisonEnabled,
  environment = ENVIRONMENT_ALL.value,
  url = '/services',
  mockPluginContext = undefined,
  params = '',
}: {
  rangeFrom: string;
  rangeTo: string;
  offset?: string;
  comparisonEnabled?: boolean;
  environment?: string;
  url?: string;
  params?: string;
  mockPluginContext?: ApmPluginContextValue;
}) {
  return ({ children }: { children?: ReactNode }) => {
    return (
      <MemoryRouter
        initialEntries={[
          `${url}?rangeFrom=${rangeFrom}&rangeTo=${rangeTo}&environment=${environment}&offset=${offset}&comparisonEnabled=${comparisonEnabled}${params}`,
        ]}
      >
        <MockApmPluginContextWrapper value={mockPluginContext}>
          <EuiThemeProvider>{children}</EuiThemeProvider>
        </MockApmPluginContextWrapper>
      </MemoryRouter>
    );
  };
}

const expectNoExpectedBoundsOption = (component: ReturnType<typeof render>) => {
  Object.values(EXPECTED_BOUNDS_TEST_SUBJ).forEach((testSubj) => {
    expect(component.queryByTestId(testSubj)).toBeNull();
  });
};

describe('TimeComparison component', () => {
  const mockMLJobs = () => {
    jest
      .spyOn(useAnomalyDetectionJobsContextModule, 'useAnomalyDetectionJobsContext')
      .mockReturnValue(
        // @ts-ignore mocking only partial data
        {
          anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
          anomalyDetectionJobsData: ML_AD_JOBS,
          anomalyDetectionSetupState: AnomalyDetectionSetupState.UpToDate,
        }
      );

    jest.spyOn(useEnvironmentContextModule, 'useEnvironmentsContext').mockReturnValue({
      preferredEnvironment: 'prod',
      environment: 'prod',
      environments: [],
      status: FETCH_STATUS.SUCCESS,
    });
  };
  beforeAll(() => {
    moment.tz.setDefault('Europe/Amsterdam');
  });
  afterAll(() => moment.tz.setDefault(''));

  const spy = jest.spyOn(urlHelpers, 'replace');
  beforeEach(() => {
    jest.resetAllMocks();
    mockMLJobs();
    jest.spyOn(useShouldShowAnomalyUiModule, 'useShouldShowAnomalyUi').mockReturnValue(false);
  });

  describe('ML expected model bounds', () => {
    const pluginContextCanGetMlJobs = merge({}, mockApmPluginContextValue, {
      core: {
        application: { capabilities: { ml: { canGetJobs: true } } },
      },
    }) as unknown as ApmPluginContextValue;

    beforeEach(() => {
      jest.spyOn(useShouldShowAnomalyUiModule, 'useShouldShowAnomalyUi').mockReturnValue(true);
    });

    it('shows disabled option for expected bounds when there are ML jobs available with sufficient permission', () => {
      jest.spyOn(useEnvironmentContextModule, 'useEnvironmentsContext').mockReturnValueOnce(
        // @ts-ignore mocking only partial data
        {
          preferredEnvironment: ENVIRONMENT_ALL.value,
        }
      );

      const Wrapper = getWrapper({
        url: '/services/frontend/transactions',
        rangeFrom: '2020-05-27T16:32:46.747Z',
        rangeTo: '2021-06-04T16:32:46.747Z',
        comparisonEnabled: true,
        offset: '32227200000ms',
        mockPluginContext: pluginContextCanGetMlJobs,
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expect(spy).not.toHaveBeenCalled();
      const expectedBoundsOption = component.getByTestId(
        EXPECTED_BOUNDS_TEST_SUBJ.allEnvironmentsDisabled
      );
      expect(expectedBoundsOption).toBeDisabled();
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });

    it('shows enabled option for expected bounds when there are ML jobs available matching the preferred environment', () => {
      jest.spyOn(useEnvironmentContextModule, 'useEnvironmentsContext').mockReturnValueOnce({
        preferredEnvironment: 'prod',
        environment: 'prod',
        environments: [],
        status: FETCH_STATUS.SUCCESS,
      });

      const Wrapper = getWrapper({
        url: '/services/frontend/overview',
        rangeFrom: '2020-05-27T16:32:46.747Z',
        rangeTo: '2021-06-04T16:32:46.747Z',
        comparisonEnabled: true,
        offset: '32227200000ms',
        mockPluginContext: pluginContextCanGetMlJobs,
        environment: 'prod',
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expect(spy).not.toHaveBeenCalled();
      const expectedBoundsOption = component.getByTestId(EXPECTED_BOUNDS_TEST_SUBJ.enabled);
      expect(expectedBoundsOption).not.toBeDisabled();
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });

    it('does not render expected bounds option when shouldShowAnomalyUi is false', () => {
      jest.spyOn(useShouldShowAnomalyUiModule, 'useShouldShowAnomalyUi').mockReturnValue(false);

      const Wrapper = getWrapper({
        url: '/services/frontend/transactions',
        rangeFrom: '2020-05-27T16:32:46.747Z',
        rangeTo: '2021-06-04T16:32:46.747Z',
        comparisonEnabled: true,
        offset: '32227200000ms',
        mockPluginContext: pluginContextCanGetMlJobs,
      });
      const component = render(<TimeComparison />, { wrapper: Wrapper });
      expectNoExpectedBoundsOption(component);
    });

    it('shows disabled option for expected bounds when no ML jobs match the current environment', () => {
      jest
        .spyOn(useAnomalyDetectionJobsContextModule, 'useAnomalyDetectionJobsContext')
        .mockReturnValue(
          // @ts-ignore mocking only partial data
          {
            anomalyDetectionJobsStatus: FETCH_STATUS.SUCCESS,
            anomalyDetectionJobsData: NO_ML_AD_JOBS,
          }
        );

      const Wrapper = getWrapper({
        url: '/services/frontend/transactions',
        rangeFrom: '2020-05-27T16:32:46.747Z',
        rangeTo: '2021-06-04T16:32:46.747Z',
        comparisonEnabled: true,
        offset: '32227200000ms',
        mockPluginContext: pluginContextCanGetMlJobs,
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expect(spy).not.toHaveBeenCalled();
      const expectedBoundsOption = component.getByTestId(
        EXPECTED_BOUNDS_TEST_SUBJ.environmentDisabled
      );
      expect(expectedBoundsOption).toBeDisabled();
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });
  });
  describe('Time range is between 0 - 25 hours', () => {
    it('sets default values', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-06-04T16:17:02.335Z',
        rangeTo: '2021-06-04T16:32:02.335Z',
      });
      render(<TimeComparison />, { wrapper: Wrapper });
      expect(spy).toHaveBeenCalledWith(expect.anything(), {
        query: {
          offset: '1d',
        },
      });
    });

    it('selects day before and enables comparison', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-06-04T16:17:02.335Z',
        rangeTo: '2021-06-04T16:32:02.335Z',
        comparisonEnabled: true,
        offset: '1d',
      });
      const component = render(<TimeComparison />, { wrapper: Wrapper });
      expectTextsInDocument(component, ['Day before', 'Week before']);
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });

    it('enables day before option when date difference is equal to 24 hours', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-06-03T16:31:35.748Z',
        rangeTo: '2021-06-04T16:31:35.748Z',
        comparisonEnabled: true,
        offset: '1d',
      });
      const component = render(<TimeComparison />, { wrapper: Wrapper });
      expectTextsInDocument(component, ['Day before', 'Week before']);
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });
  });

  describe('Time range is between 25 hours - 8 days', () => {
    it("doesn't show day before option when date difference is greater than 25 hours", () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-06-02T12:32:00.000Z',
        rangeTo: '2021-06-03T13:32:09.079Z',
        comparisonEnabled: true,
        offset: '1w',
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expectTextsNotInDocument(component, ['Day before']);
      expectTextsInDocument(component, ['Week before']);
    });

    it('sets default values', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-06-02T12:32:00.000Z',
        rangeTo: '2021-06-03T13:32:09.079Z',
      });
      render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expect(spy).toHaveBeenCalledWith(expect.anything(), {
        query: {
          offset: '1w',
        },
      });
    });

    it('selects week before and enables comparison', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-06-02T12:32:00.000Z',
        rangeTo: '2021-06-03T13:32:09.079Z',
        comparisonEnabled: true,
        offset: '1w',
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expectTextsNotInDocument(component, ['Day before']);
      expectTextsInDocument(component, ['Week before']);
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });
  });

  describe('Time range is greater than 8 days', () => {
    it('Shows absolute times without year when within the same year', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2021-05-27T16:32:46.747Z',
        rangeTo: '2021-06-04T16:32:46.747Z',
        comparisonEnabled: true,
        offset: '691200000ms',
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expect(spy).not.toHaveBeenCalled();
      expectTextsInDocument(component, ['19/05 18:32 - 27/05 18:32']);
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });

    it('Shows absolute times with year when on different year', () => {
      const Wrapper = getWrapper({
        rangeFrom: '2020-05-27T16:32:46.747Z',
        rangeTo: '2021-06-04T16:32:46.747Z',
        comparisonEnabled: true,
        offset: '32227200000ms',
      });
      const component = render(<TimeComparison />, {
        wrapper: Wrapper,
      });
      expect(spy).not.toHaveBeenCalled();
      expectTextsInDocument(component, ['20/05/19 18:32 - 27/05/20 18:32']);
      expect(
        (component.getByTestId('comparisonSelect') as HTMLSelectElement).selectedIndex
      ).toEqual(0);
    });
  });
});
